import type {
	LinearIssueListItem,
	LinkedPrSummary,
	NeedsHumanItem,
	NeedsHumanReasonKind,
	QueueRunSummary,
	RecentlyDoneEntry,
	Run,
	RunState
} from '@/types'
import { describe, expect, it } from 'vitest'

import { pickPrimaryAction, pickSecondaryAction } from './actions'

const baseIssue: LinearIssueListItem = {
	id: 'issue-1',
	identifier: 'SUP-1',
	title: 'demo',
	status: { state_type: 'unstarted', name: 'Todo', color: '#fff' },
	priority: { value: 3, label: 'Medium' },
	labels: [],
	assignee: null,
	project: null,
	parent: null,
	children: [],
	blocked_by: [],
	url: '',
	created_at: '2026-01-01T00:00:00Z',
	updated_at: '2026-01-01T00:00:00Z'
}

const baseRun: Run = {
	id: 'run-1',
	issue_id: 'issue-1',
	issue_identifier: 'SUP-1',
	repo_slug: 'org/repo',
	state: 'coding',
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

function queueRun(overrides: Partial<QueueRunSummary> = {}): QueueRunSummary {
	return {
		...baseRun,
		queue: 'active',
		reason: 'reason',
		pending_attention_count: 0,
		pending_interrupt_count: 0,
		ownership: [],
		...overrides
	}
}

function needsHumanFromRun(
	reasonKind: NeedsHumanReasonKind,
	run: QueueRunSummary = queueRun()
): NeedsHumanItem {
	return {
		id: `run:${run.id}`,
		priority: 0,
		reasonKind,
		reason: 'because',
		source: { kind: 'queue-run', run }
	}
}

function needsHumanFromIssue(): NeedsHumanItem {
	return {
		id: 'issue:issue-1',
		priority: 0,
		reasonKind: 'awaiting_approval',
		reason: 'Approve',
		source: {
			kind: 'launch-issue',
			item: { kind: 'issue', bucket: 'needs-human', reason: 'Approve', issue: baseIssue }
		}
	}
}

const pr: LinkedPrSummary = { number: 7, url: 'https://gh/pr/7', state: 'open', merged_at: null }

describe('pickPrimaryAction — needs-human', () => {
	it('awaiting_approval → Approve, routes to issue detail', () => {
		const a = pickPrimaryAction({ kind: 'needs-human', item: needsHumanFromIssue() })
		expect(a.verb).toBe('approve')
		expect(a.destination).toEqual({ kind: 'issue', issueId: 'issue-1' })
	})

	it('attention_pending → Answer, opens chat at run detail', () => {
		const a = pickPrimaryAction({
			kind: 'needs-human',
			item: needsHumanFromRun('attention_pending')
		})
		expect(a.verb).toBe('answer')
		expect(a.destination).toEqual({ kind: 'run', runId: 'run-1', openChat: true })
	})

	it('interrupt_pending → Take over, routes to run terminal hash', () => {
		const a = pickPrimaryAction({
			kind: 'needs-human',
			item: needsHumanFromRun('interrupt_pending')
		})
		expect(a.verb).toBe('takeover')
		expect(a.destination).toEqual({ kind: 'run', runId: 'run-1', hash: 'terminal' })
	})

	it('stalled → Resume, routes to run detail', () => {
		const a = pickPrimaryAction({ kind: 'needs-human', item: needsHumanFromRun('stalled') })
		expect(a.verb).toBe('resume')
		expect(a.destination).toEqual({ kind: 'run', runId: 'run-1' })
	})

	it('budget_paused → Resume, routes to run detail', () => {
		const a = pickPrimaryAction({ kind: 'needs-human', item: needsHumanFromRun('budget_paused') })
		expect(a.verb).toBe('resume')
		expect(a.destination).toEqual({ kind: 'run', runId: 'run-1' })
	})

	it('recently_failed → Review, prefers PR url when present', () => {
		const a = pickPrimaryAction({
			kind: 'needs-human',
			item: needsHumanFromRun('recently_failed', queueRun({ state: 'failed', pr }))
		})
		expect(a.verb).toBe('review')
		expect(a.destination).toEqual({ kind: 'external', href: pr.url })
	})

	it('recently_failed without PR → Review, falls back to run detail', () => {
		const a = pickPrimaryAction({
			kind: 'needs-human',
			item: needsHumanFromRun('recently_failed', queueRun({ state: 'failed' }))
		})
		expect(a.destination).toEqual({ kind: 'run', runId: 'run-1' })
	})
})

describe('pickSecondaryAction — needs-human', () => {
	it('awaiting_approval has no secondary action', () => {
		expect(pickSecondaryAction({ kind: 'needs-human', item: needsHumanFromIssue() })).toBeNull()
	})

	it('attention_pending exposes Take over as secondary', () => {
		const a = pickSecondaryAction({
			kind: 'needs-human',
			item: needsHumanFromRun('attention_pending')
		})
		expect(a?.verb).toBe('takeover')
	})

	it('interrupt_pending demotes View as secondary (takeover is already primary)', () => {
		const a = pickSecondaryAction({
			kind: 'needs-human',
			item: needsHumanFromRun('interrupt_pending')
		})
		expect(a?.verb).toBe('view')
	})
})

describe('pickPrimaryAction — queue-run (run card / running now)', () => {
	const cases: ReadonlyArray<
		[string, Partial<QueueRunSummary>, 'answer' | 'takeover' | 'resume' | 'review' | 'view']
	> = [
		['idle active run → View', {}, 'view'],
		['pending attention → Answer', { pending_attention_count: 1 }, 'answer'],
		[
			'pending interrupts → Take over',
			{ pending_interrupt_count: 1, pending_attention_count: 1 },
			'takeover'
		],
		[
			'stalled → Resume',
			{
				stalled_for_seconds: 60,
				stalled_reason: { kind: 'no_heartbeat', state: 'coding' as RunState }
			},
			'resume'
		],
		['budget pause → Resume', { pause_kind: 'budget', pause_reason: 'over budget' }, 'resume'],
		['failed with PR → Review', { state: 'failed', pr }, 'review'],
		['open PR → Review', { pr }, 'review']
	]

	for (const [name, overrides, expected] of cases) {
		it(name, () => {
			expect(pickPrimaryAction({ kind: 'queue-run', run: queueRun(overrides) }).verb).toBe(expected)
		})
	}

	it('Take over is never primary unless interrupt_pending', () => {
		const noInterrupt = pickPrimaryAction({ kind: 'queue-run', run: queueRun() }).verb
		expect(noInterrupt).not.toBe('takeover')
	})
})

describe('pickSecondaryAction — queue-run', () => {
	it('when primary is Take over, secondary falls back to View', () => {
		const a = pickSecondaryAction({
			kind: 'queue-run',
			run: queueRun({ pending_interrupt_count: 1 })
		})
		expect(a?.verb).toBe('view')
	})

	it('when primary is View, no secondary needed', () => {
		expect(pickSecondaryAction({ kind: 'queue-run', run: queueRun() })).toBeNull()
	})

	it('when primary is Answer, secondary exposes Take over', () => {
		const a = pickSecondaryAction({
			kind: 'queue-run',
			run: queueRun({ pending_attention_count: 1 })
		})
		expect(a?.verb).toBe('takeover')
	})
})

describe('pickPrimaryAction — recently-done', () => {
	it('run entry with PR → Review external', () => {
		const entry: RecentlyDoneEntry = {
			id: 'r',
			timestamp: 0,
			item: {
				kind: 'run',
				bucket: 'done',
				reason: 'shipped',
				pending_attention_count: 0,
				pending_interrupt_count: 0,
				pr,
				run: baseRun
			}
		}
		const a = pickPrimaryAction({ kind: 'recently-done', entry })
		expect(a.verb).toBe('review')
		expect(a.destination).toEqual({ kind: 'external', href: pr.url })
	})

	it('run entry without PR → View run', () => {
		const entry: RecentlyDoneEntry = {
			id: 'r',
			timestamp: 0,
			item: {
				kind: 'run',
				bucket: 'done',
				reason: 'shipped',
				pending_attention_count: 0,
				pending_interrupt_count: 0,
				run: baseRun
			}
		}
		const a = pickPrimaryAction({ kind: 'recently-done', entry })
		expect(a.verb).toBe('view')
		expect(a.destination).toEqual({ kind: 'run', runId: 'run-1' })
	})

	it('issue entry → View issue', () => {
		const entry: RecentlyDoneEntry = {
			id: 'i',
			timestamp: 0,
			item: { kind: 'issue', bucket: 'done', reason: 'closed', issue: baseIssue }
		}
		const a = pickPrimaryAction({ kind: 'recently-done', entry })
		expect(a.verb).toBe('view')
		expect(a.destination).toEqual({ kind: 'issue', issueId: 'issue-1' })
	})
})

describe('pickPrimaryAction — ready-to-launch', () => {
	it('returns the Launch verb with a dispatch destination', () => {
		const a = pickPrimaryAction({ kind: 'ready-to-launch', issue: baseIssue })
		expect(a.verb).toBe('launch')
		expect(a.destination).toEqual({ kind: 'dispatch' })
	})
})
