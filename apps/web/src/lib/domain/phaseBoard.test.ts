import type { OperatorQueue, QueueRunSummary } from '@/types'
import { describe, expect, it } from 'vitest'

import { PHASE_ORDER, boardNeedsYou, phaseForRun, toPhaseColumns } from './phaseBoard'

function run(overrides: Partial<QueueRunSummary> = {}): QueueRunSummary {
	return {
		id: 'run-1',
		issue_id: 'SUP-1',
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
		pause_reason: null,
		queue: 'active',
		reason: '',
		pending_attention_count: 0,
		pending_interrupt_count: 0,
		ownership: [],
		...overrides
	}
}

function groupsOf(...runs: QueueRunSummary[]): Record<OperatorQueue, QueueRunSummary[]> {
	const groups: Record<OperatorQueue, QueueRunSummary[]> = {
		waiting: [],
		active: [],
		'in-pr': [],
		done: [],
		'blocked-by-dependency': [],
		'needs-human': []
	}
	for (const r of runs) groups[r.queue].push(r)
	return groups
}

function column(columns: ReturnType<typeof toPhaseColumns>, phase: string) {
	const found = columns.find((c) => c.phase === phase)
	if (!found) throw new Error(`missing column ${phase}`)
	return found
}

describe('phaseForRun', () => {
	const cases: ReadonlyArray<[Partial<QueueRunSummary>, ReturnType<typeof phaseForRun>]> = [
		[{ state: 'queued', queue: 'waiting' }, 'queued'],
		[{ state: 'preparing', queue: 'waiting' }, 'queued'],
		[{ state: 'planning', queue: 'active' }, 'planning'],
		[{ state: 'coding', queue: 'active' }, 'coding'],
		[{ state: 'running_commands', queue: 'active' }, 'coding'],
		[{ state: 'reviewing', queue: 'active' }, 'review'],
		[{ state: 'opening_pr', queue: 'active' }, 'pr'],
		[{ state: 'completed', queue: 'in-pr' }, 'pr'],
		[{ state: 'completed', queue: 'done' }, 'done'],
		[{ state: 'failed', queue: 'needs-human' }, 'done'],
		[{ state: 'cancelled', queue: 'done' }, 'done']
	]
	for (const [over, expected] of cases) {
		it(`${over.state} (${over.queue}) → ${expected}`, () => {
			expect(phaseForRun(run(over))).toBe(expected)
		})
	}

	it('places a waiting_human run by its current step', () => {
		expect(phaseForRun(run({ state: 'waiting_human', current_step_key: 'code' }))).toBe('coding')
		expect(phaseForRun(run({ state: 'waiting_human', current_step_key: 'review_swarm' }))).toBe('review')
	})

	it('falls back to coding when a paused run has no step', () => {
		expect(phaseForRun(run({ state: 'waiting_human', current_step_key: null }))).toBe('coding')
	})
})

describe('boardNeedsYou', () => {
	it('flags waiting_human / pauses / attention / needs-human / blocked', () => {
		expect(boardNeedsYou(run({ state: 'waiting_human' }))).toBe(true)
		expect(boardNeedsYou(run({ pause_kind: 'approval' }))).toBe(true)
		expect(boardNeedsYou(run({ pause_kind: 'budget' }))).toBe(true)
		expect(boardNeedsYou(run({ pending_attention_count: 1 }))).toBe(true)
		expect(boardNeedsYou(run({ queue: 'needs-human' }))).toBe(true)
		expect(boardNeedsYou(run({ queue: 'blocked-by-dependency' }))).toBe(true)
	})

	it('is false for a clean active run', () => {
		expect(boardNeedsYou(run({ state: 'coding', queue: 'active' }))).toBe(false)
	})
})

describe('PHASE_ORDER', () => {
	it('runs Queued → Planning → Coding → Review → PR → Done', () => {
		expect(PHASE_ORDER).toEqual(['queued', 'planning', 'coding', 'review', 'pr', 'done'])
	})
})

describe('toPhaseColumns', () => {
	it('returns all six columns in order even when empty', () => {
		const columns = toPhaseColumns(groupsOf())
		expect(columns.map((c) => c.phase)).toEqual(['queued', 'planning', 'coding', 'review', 'pr', 'done'])
		for (const c of columns) expect(c.cards).toEqual([])
	})

	it('routes each run to its phase column', () => {
		const columns = toPhaseColumns(
			groupsOf(
				run({ id: 'a', issue_id: 'A', state: 'planning', queue: 'active' }),
				run({ id: 'b', issue_id: 'B', state: 'coding', queue: 'active' }),
				run({ id: 'c', issue_id: 'C', state: 'reviewing', queue: 'active' }),
				run({ id: 'd', issue_id: 'D', state: 'completed', queue: 'in-pr' }),
				run({
					id: 'e',
					issue_id: 'E',
					state: 'completed',
					queue: 'done',
					finished_at: '2026-01-02T00:00:00Z'
				})
			)
		)
		expect(column(columns, 'planning').cards.map((c) => c.run.id)).toEqual(['a'])
		expect(column(columns, 'coding').cards.map((c) => c.run.id)).toEqual(['b'])
		expect(column(columns, 'review').cards.map((c) => c.run.id)).toEqual(['c'])
		expect(column(columns, 'pr').cards.map((c) => c.run.id)).toEqual(['d'])
		expect(column(columns, 'done').cards.map((c) => c.run.id)).toEqual(['e'])
	})

	it('keeps one card per issue — the latest run by start time', () => {
		const columns = toPhaseColumns(
			groupsOf(
				run({
					id: 'old',
					issue_id: 'A',
					state: 'completed',
					queue: 'done',
					started_at: '2026-01-01T00:00:00Z',
					finished_at: '2026-01-01T01:00:00Z'
				}),
				run({
					id: 'new',
					issue_id: 'A',
					state: 'coding',
					queue: 'active',
					started_at: '2026-01-02T00:00:00Z'
				})
			)
		)
		expect(column(columns, 'coding').cards.map((c) => c.run.id)).toEqual(['new'])
		expect(column(columns, 'done').cards).toEqual([])
	})

	it('sorts needs-you cards to the top of a live column', () => {
		const columns = toPhaseColumns(
			groupsOf(
				run({
					id: 'calm',
					issue_id: 'A',
					state: 'coding',
					queue: 'active',
					started_at: '2026-01-01T00:00:00Z'
				}),
				run({
					id: 'blocked',
					issue_id: 'B',
					state: 'coding',
					queue: 'active',
					pause_kind: 'approval',
					started_at: '2026-01-02T00:00:00Z'
				})
			)
		)
		const coding = column(columns, 'coding')
		expect(coding.cards.map((c) => c.run.id)).toEqual(['blocked', 'calm'])
		expect(coding.cards[0].needsYou).toBe(true)
	})

	it('sorts Done most-recently-finished first and never flags needs-you', () => {
		const columns = toPhaseColumns(
			groupsOf(
				run({
					id: 'older',
					issue_id: 'A',
					state: 'completed',
					queue: 'done',
					finished_at: '2026-01-01T00:00:00Z'
				}),
				run({
					id: 'newer',
					issue_id: 'B',
					state: 'completed',
					queue: 'done',
					finished_at: '2026-01-03T00:00:00Z'
				})
			)
		)
		const done = column(columns, 'done')
		expect(done.cards.map((c) => c.run.id)).toEqual(['newer', 'older'])
		expect(done.cards.every((c) => c.needsYou === false)).toBe(true)
	})

	it('caps the Done column at the 20 most recent', () => {
		const dones = Array.from({ length: 25 }, (_, i) =>
			run({
				id: `done-${i}`,
				issue_id: `D${i}`,
				state: 'completed',
				queue: 'done',
				finished_at: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`
			})
		)
		const done = column(toPhaseColumns(groupsOf(...dones)), 'done')
		expect(done.cards).toHaveLength(20)
		expect(done.cards[0].run.id).toBe('done-24')
		expect(done.cards.map((c) => c.run.id)).not.toContain('done-0')
	})
})
