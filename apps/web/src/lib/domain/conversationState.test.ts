import type { ActiveTakeover, AttentionSummary, ConversationSummary, Run, Turn, TurnStatus } from '@/types'
import { describe, expect, it } from 'vitest'

import { conversationStateTone, deriveConversationUxState } from './conversationState'

function summary(): ConversationSummary {
	return {
		id: 'c1',
		subject: { kind: 'issue', identifier: 'SUP-1' },
		agent_id: 'agent-1',
		provider: 'claude',
		status: 'active',
		provider_session_id: null,
		created_at: '2026-01-01T00:00:00Z',
		updated_at: '2026-01-01T00:00:00Z',
		last_turn_at: null,
		first_user_text: null
	}
}

function turn(seq: number, status: TurnStatus): Turn {
	return {
		id: `t-${seq}`,
		conversation_id: 'c1',
		seq,
		user_text: 'hi',
		status,
		usage: null,
		error: null,
		cancel_reason: null,
		created_at: '2026-01-01T00:00:00Z',
		started_at: null,
		finished_at: null
	}
}

function run(state: Run['state']): Run {
	return {
		id: 'r1',
		issue_id: 'SUP-1',
		issue_identifier: 'SUP-1',
		repo_slug: 'org/repo',
		state,
		trigger_source: 'operator',
		current_step_key: null,
		base_branch: 'main',
		worktree_path: null,
		branch_name: null,
		operator_instructions: null,
		started_at: '2026-01-01T00:00:00Z',
		updated_at: '2026-01-01T00:00:00Z',
		finished_at: null,
		error_message: null,
		budget: { duration_secs: null, retries_max: null, token_ceiling: null },
		pause_kind: 'none',
		pause_reason: null
	}
}

function takeover(mode: ActiveTakeover['mode']): ActiveTakeover {
	return {
		takeover_session_id: 'tk-1',
		mode,
		opened_at: '2026-01-01T00:00:00Z',
		operator_id: null
	}
}

function attention(pendingAttention: number, pendingInterrupts = 0): AttentionSummary {
	return {
		pendingAttention,
		pendingInterrupts,
		total: pendingAttention + pendingInterrupts
	}
}

describe('deriveConversationUxState — base cases', () => {
	it('returns draft when there are no turns', () => {
		expect(deriveConversationUxState({ conversation: summary(), turns: [] })).toBe('draft')
	})

	it('returns draft when no turns are loaded and the row has never had one', () => {
		expect(deriveConversationUxState({ conversation: summary() })).toBe('draft')
		expect(deriveConversationUxState({ conversation: summary(), turns: null })).toBe('draft')
	})

	it('falls back to completed when turns are not loaded but last_turn_at is set', () => {
		const c: ConversationSummary = { ...summary(), last_turn_at: '2026-01-02T00:00:00Z' }
		expect(deriveConversationUxState({ conversation: c })).toBe('completed')
		expect(deriveConversationUxState({ conversation: c, turns: null })).toBe('completed')
	})

	it('returns running when the latest turn is pending', () => {
		expect(deriveConversationUxState({ conversation: summary(), turns: [turn(1, 'pending')] })).toBe(
			'running'
		)
	})

	it('returns running when the latest turn is streaming', () => {
		expect(
			deriveConversationUxState({
				conversation: summary(),
				turns: [turn(1, 'completed'), turn(2, 'streaming')]
			})
		).toBe('running')
	})

	it('returns failed when the latest turn failed', () => {
		expect(
			deriveConversationUxState({
				conversation: summary(),
				turns: [turn(1, 'completed'), turn(2, 'failed')]
			})
		).toBe('failed')
	})

	it('returns completed when the latest turn completed (no run signal)', () => {
		expect(deriveConversationUxState({ conversation: summary(), turns: [turn(1, 'completed')] })).toBe(
			'completed'
		)
	})

	it('treats a cancelled latest turn as completed (UX-terminal, distinct from failure)', () => {
		expect(deriveConversationUxState({ conversation: summary(), turns: [turn(1, 'cancelled')] })).toBe(
			'completed'
		)
	})
})

describe('deriveConversationUxState — picks the latest turn', () => {
	it('uses the last element when input is sorted ascending by seq (the API contract)', () => {
		expect(
			deriveConversationUxState({
				conversation: summary(),
				turns: [turn(1, 'completed'), turn(2, 'streaming'), turn(3, 'failed')]
			})
		).toBe('failed')
	})
})

describe('deriveConversationUxState — needs_human signals', () => {
	it('returns needs_human when run.state is waiting_human', () => {
		expect(
			deriveConversationUxState({
				conversation: summary(),
				turns: [turn(1, 'completed')],
				run: run('waiting_human')
			})
		).toBe('needs_human')
	})

	it('returns needs_human when pendingAttention > 0', () => {
		expect(
			deriveConversationUxState({
				conversation: summary(),
				turns: [turn(1, 'completed')],
				run: run('coding'),
				attention: attention(1)
			})
		).toBe('needs_human')
	})

	it('returns needs_human when pendingInterrupts > 0', () => {
		expect(
			deriveConversationUxState({
				conversation: summary(),
				turns: [turn(1, 'completed')],
				run: run('coding'),
				attention: attention(0, 2)
			})
		).toBe('needs_human')
	})

	it('does NOT downgrade running to needs_human when a turn is in flight', () => {
		expect(
			deriveConversationUxState({
				conversation: summary(),
				turns: [turn(1, 'streaming')],
				run: run('waiting_human'),
				attention: attention(3)
			})
		).toBe('running')
	})
})

describe('deriveConversationUxState — precedence', () => {
	it('taken_over outranks failed', () => {
		expect(
			deriveConversationUxState({
				conversation: summary(),
				turns: [turn(1, 'failed')],
				takeovers: [takeover('force_takeover')]
			})
		).toBe('taken_over')
	})

	it('taken_over outranks running and needs_human', () => {
		expect(
			deriveConversationUxState({
				conversation: summary(),
				turns: [turn(1, 'streaming')],
				run: run('waiting_human'),
				takeovers: [takeover('force_takeover')]
			})
		).toBe('taken_over')
	})

	it('failed outranks needs_human', () => {
		expect(
			deriveConversationUxState({
				conversation: summary(),
				turns: [turn(1, 'failed')],
				run: run('waiting_human'),
				attention: attention(2)
			})
		).toBe('failed')
	})

	it('inspect-mode takeover does NOT bump to taken_over (only force_takeover does)', () => {
		expect(
			deriveConversationUxState({
				conversation: summary(),
				turns: [turn(1, 'completed')],
				takeovers: [takeover('inspect'), takeover('interactive_continuation')]
			})
		).toBe('completed')
	})

	it('taken_over outranks draft (no turns yet, force_takeover already opened)', () => {
		expect(
			deriveConversationUxState({
				conversation: summary(),
				turns: [],
				takeovers: [takeover('force_takeover')]
			})
		).toBe('taken_over')
	})

	it('inspect-mode takeover does NOT mask a failed turn', () => {
		expect(
			deriveConversationUxState({
				conversation: summary(),
				turns: [turn(1, 'failed')],
				takeovers: [takeover('inspect')]
			})
		).toBe('failed')
	})

	it('needs_human only wins after the latest turn settles', () => {
		expect(
			deriveConversationUxState({
				conversation: summary(),
				turns: [turn(1, 'completed')],
				run: run('waiting_human')
			})
		).toBe('needs_human')
	})
})

describe('conversationStateTone', () => {
	it('maps every UX state to a Pill tone', () => {
		expect(conversationStateTone.draft).toBe('neutral')
		expect(conversationStateTone.running).toBe('info')
		expect(conversationStateTone.needs_human).toBe('warn')
		expect(conversationStateTone.completed).toBe('success')
		expect(conversationStateTone.failed).toBe('danger')
		expect(conversationStateTone.taken_over).toBe('accent')
	})
})
