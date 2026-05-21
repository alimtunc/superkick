import type { LaunchQueue, LaunchQueueItem, TaskBadgeKind } from '@/types'
import { describe, expect, it } from 'vitest'

import { taskBadgeFor } from './taskBadge'

function issueItem(bucket: LaunchQueue): LaunchQueueItem {
	return {
		kind: 'issue',
		bucket,
		reason: 'test',
		issue: {
			id: 'x',
			identifier: 'SUP-1',
			title: 'test',
			status: { state_type: 'started', name: 'In Progress', color: '#fff' },
			team_id: null,
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
	}
}

function runItem(bucket: LaunchQueue): LaunchQueueItem {
	return {
		kind: 'run',
		bucket,
		reason: 'test',
		pending_attention_count: 0,
		pending_interrupt_count: 0,
		run: {
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
			pause_reason: null
		}
	}
}

describe('taskBadgeFor', () => {
	const cases: ReadonlyArray<[LaunchQueue, TaskBadgeKind | null]> = [
		['backlog', null],
		['todo', null],
		['launchable', null],
		['waiting', null],
		['blocked', null],
		['active', 'running'],
		['needs-human', 'needs'],
		['in-pr', 'review'],
		['done', 'shipped']
	]

	for (const [bucket, expected] of cases) {
		it(`issue@${bucket} → ${expected}`, () => {
			expect(taskBadgeFor(issueItem(bucket))).toBe(expected)
		})
	}

	it('classifies run items the same way (bucket-driven)', () => {
		expect(taskBadgeFor(runItem('active'))).toBe('running')
		expect(taskBadgeFor(runItem('needs-human'))).toBe('needs')
		expect(taskBadgeFor(runItem('in-pr'))).toBe('review')
		expect(taskBadgeFor(runItem('done'))).toBe('shipped')
	})
})
