import type { LaunchQueue, LaunchQueueItem, LinearIssueListItem } from '@/types'
import { describe, expect, it } from 'vitest'

import {
	ISSUE_STATE_ORDER,
	groupItemsByIssueState,
	issueStateFor,
	issueStateFromLinear,
	mapLaunchQueueToIssueState
} from './issueState'

function issueItem(bucket: LaunchQueue, identifier = 'SUP-1'): LaunchQueueItem {
	return {
		kind: 'issue',
		bucket,
		reason: 'test',
		issue: {
			id: identifier,
			identifier,
			title: 'test issue',
			status: { state_type: 'started', name: 'In Progress', color: '#fff' },
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

function runItem(
	bucket: LaunchQueue,
	{ attention = 0, interrupts = 0 }: { attention?: number; interrupts?: number } = {}
): LaunchQueueItem {
	return {
		kind: 'run',
		bucket,
		reason: 'test',
		pending_attention_count: attention,
		pending_interrupt_count: interrupts,
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

describe('mapLaunchQueueToIssueState', () => {
	const cases: ReadonlyArray<[LaunchQueue, ReturnType<typeof mapLaunchQueueToIssueState>]> = [
		['backlog', 'backlog'],
		['todo', 'todo'],
		['launchable', 'todo'],
		['waiting', 'todo'],
		['blocked', 'todo'],
		['active', 'in_progress'],
		['needs-human', 'needs_human'],
		['in-pr', 'in_review'],
		['done', 'done']
	]

	for (const [bucket, expected] of cases) {
		it(`${bucket} → ${expected}`, () => {
			expect(mapLaunchQueueToIssueState(bucket)).toBe(expected)
		})
	}
})

describe('ISSUE_STATE_ORDER', () => {
	it('lists exactly six states in canonical kanban order', () => {
		expect(ISSUE_STATE_ORDER).toEqual([
			'backlog',
			'todo',
			'in_progress',
			'needs_human',
			'in_review',
			'done'
		])
	})
})

describe('groupItemsByIssueState', () => {
	it('returns every issue state as a key, even when empty', () => {
		const groups = groupItemsByIssueState([])
		for (const state of ISSUE_STATE_ORDER) {
			expect(groups[state]).toEqual([])
		}
	})

	it('routes waiting / blocked / launchable items into the todo lane', () => {
		const items = [issueItem('waiting', 'A'), issueItem('blocked', 'B'), issueItem('launchable', 'C')]
		const groups = groupItemsByIssueState(items)
		expect(groups.todo).toHaveLength(3)
		expect(groups.in_progress).toHaveLength(0)
	})

	it('routes runs into in_progress / needs_human / in_review / done', () => {
		const items = [runItem('active'), runItem('needs-human'), runItem('in-pr'), runItem('done')]
		const groups = groupItemsByIssueState(items)
		expect(groups.in_progress).toHaveLength(1)
		expect(groups.needs_human).toHaveLength(1)
		expect(groups.in_review).toHaveLength(1)
		expect(groups.done).toHaveLength(1)
	})
})

describe('issueStateFromLinear (fallback path)', () => {
	it('maps every Linear state to an issue state, collapsing canceled into done', () => {
		expect(issueStateFromLinear('backlog')).toBe('backlog')
		expect(issueStateFromLinear('unstarted')).toBe('todo')
		expect(issueStateFromLinear('started')).toBe('in_progress')
		expect(issueStateFromLinear('completed')).toBe('done')
		expect(issueStateFromLinear('canceled')).toBe('done')
	})
})

describe('issueStateFor', () => {
	const baseIssue: LinearIssueListItem = {
		id: 'x',
		identifier: 'SUP-99',
		title: 'cold issue',
		status: { state_type: 'started', name: 'In Progress', color: '#fff' },
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

	it('prefers the launch-queue bucket when present', () => {
		const buckets = new Map<string, LaunchQueue>([['SUP-99', 'needs-human']])
		expect(issueStateFor(baseIssue, buckets)).toBe('needs_human')
	})

	it('falls back to the Linear state when the issue is absent from the queue snapshot', () => {
		const buckets = new Map<string, LaunchQueue>()
		expect(issueStateFor(baseIssue, buckets)).toBe('in_progress')
	})
})
