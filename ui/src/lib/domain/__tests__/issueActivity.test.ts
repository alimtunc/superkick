import type { IssueComment, LinkedPrSummary, LinkedRunSummary } from '@/types'
import { describe, expect, it } from 'vitest'

import { buildIssueActivity } from '../issueActivity'

function comment(overrides: Partial<IssueComment> & Pick<IssueComment, 'id' | 'created_at'>): IssueComment {
	return {
		id: overrides.id,
		body: overrides.body ?? 'comment body',
		author: overrides.author ?? { id: 'u-1', name: 'Alice', avatar_url: null },
		created_at: overrides.created_at,
		updated_at: overrides.updated_at ?? overrides.created_at,
		parent_id: overrides.parent_id ?? null
	}
}

function run(
	overrides: Partial<LinkedRunSummary> & Pick<LinkedRunSummary, 'id' | 'state' | 'started_at'>
): LinkedRunSummary {
	return {
		id: overrides.id,
		state: overrides.state,
		started_at: overrides.started_at,
		finished_at: overrides.finished_at ?? null,
		pr: overrides.pr
	}
}

const PR: LinkedPrSummary = {
	number: 42,
	url: 'https://example.com/pr/42',
	state: 'open',
	merged_at: null
}

describe('buildIssueActivity', () => {
	it('orders comments and run events ascending by timestamp', () => {
		const items = buildIssueActivity(
			[
				comment({ id: 'c-late', created_at: '2026-05-25T12:00:00.000Z' }),
				comment({ id: 'c-early', created_at: '2026-05-25T08:00:00.000Z' })
			],
			[
				run({
					id: 'r-1',
					state: 'completed',
					started_at: '2026-05-25T09:00:00.000Z',
					finished_at: '2026-05-25T10:00:00.000Z'
				})
			]
		)

		expect(items.map((i) => i.key)).toEqual([
			'comment:c-early',
			'run-launched:r-1',
			'run-completed:r-1',
			'comment:c-late'
		])
	})

	it('emits only a launched event for non-terminal runs', () => {
		const items = buildIssueActivity(
			[],
			[
				run({
					id: 'r-coding',
					state: 'coding',
					started_at: '2026-05-25T09:00:00.000Z'
				})
			]
		)

		expect(items).toHaveLength(1)
		expect(items[0]).toMatchObject({ kind: 'run_launched', key: 'run-launched:r-coding' })
	})

	it('emits launched + completed for terminal runs with a finished_at', () => {
		const items = buildIssueActivity(
			[],
			[
				run({
					id: 'r-done',
					state: 'completed',
					started_at: '2026-05-25T09:00:00.000Z',
					finished_at: '2026-05-25T10:00:00.000Z',
					pr: PR
				})
			]
		)

		expect(items.map((i) => i.kind)).toEqual(['run_launched', 'run_completed'])
		const completed = items[1]
		expect(completed.kind).toBe('run_completed')
		if (completed.kind === 'run_completed') {
			expect(completed.run.pr?.number).toBe(42)
		}
	})

	it('excludes waiting_human runs from the timeline', () => {
		const items = buildIssueActivity(
			[],
			[
				run({
					id: 'r-waiting',
					state: 'waiting_human',
					started_at: '2026-05-25T09:00:00.000Z'
				})
			]
		)

		expect(items).toEqual([])
	})

	it('omits the completion event when finished_at is missing', () => {
		const items = buildIssueActivity(
			[],
			[
				run({
					id: 'r-half',
					state: 'failed',
					started_at: '2026-05-25T09:00:00.000Z',
					finished_at: null
				})
			]
		)

		expect(items.map((i) => i.kind)).toEqual(['run_launched'])
	})

	it('returns an empty list for empty inputs', () => {
		expect(buildIssueActivity([], [])).toEqual([])
	})

	it('breaks timestamp ties deterministically: comment < launched < completed', () => {
		const ts = '2026-05-25T09:00:00.000Z'
		const items = buildIssueActivity(
			[comment({ id: 'c-tie', created_at: ts })],
			[
				run({
					id: 'r-tie',
					state: 'completed',
					started_at: ts,
					finished_at: ts
				})
			]
		)

		expect(items.map((i) => i.key)).toEqual([
			'comment:c-tie',
			'run-launched:r-tie',
			'run-completed:r-tie'
		])
	})
})
