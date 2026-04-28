import type { LaunchQueue, LaunchQueueItem, LinearIssueListItem } from '@/types'
import { describe, expect, it } from 'vitest'

import {
	V1_STATE_ORDER,
	extraBadgesForV1,
	groupItemsByV1State,
	mapLaunchQueueToV1State,
	v1StateForIssue,
	v1StateFromLinear
} from './issuesV1State'

const ALL_BUCKETS: LaunchQueue[] = [
	'backlog',
	'todo',
	'launchable',
	'waiting',
	'blocked',
	'active',
	'needs-human',
	'in-pr',
	'done'
]

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

describe('mapLaunchQueueToV1State', () => {
	const cases: ReadonlyArray<[LaunchQueue, ReturnType<typeof mapLaunchQueueToV1State>]> = [
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
			expect(mapLaunchQueueToV1State(bucket)).toBe(expected)
		})
	}

	it('covers all 9 buckets exhaustively', () => {
		for (const bucket of ALL_BUCKETS) {
			expect(() => mapLaunchQueueToV1State(bucket)).not.toThrow()
		}
	})
})

describe('V1_STATE_ORDER', () => {
	it('lists exactly six states in canonical kanban order', () => {
		expect(V1_STATE_ORDER).toEqual(['backlog', 'todo', 'in_progress', 'needs_human', 'in_review', 'done'])
	})
})

describe('extraBadgesForV1', () => {
	it('marks waiting items with a waiting badge (no column for them)', () => {
		expect(extraBadgesForV1(issueItem('waiting'))).toContain('waiting')
	})

	it('marks blocked items with a blocked badge (no column for them)', () => {
		expect(extraBadgesForV1(issueItem('blocked'))).toContain('blocked')
	})

	it('marks launchable items with a launchable cue inside the Todo lane', () => {
		expect(extraBadgesForV1(issueItem('launchable'))).toContain('launchable')
	})

	it('marks runs with pending attention as needs-human-attention', () => {
		expect(extraBadgesForV1(runItem('active', { attention: 2 }))).toContain('needs-human-attention')
	})

	it('returns no badges for plain todo / backlog issues', () => {
		expect(extraBadgesForV1(issueItem('todo'))).toEqual([])
		expect(extraBadgesForV1(issueItem('backlog'))).toEqual([])
	})
})

describe('groupItemsByV1State', () => {
	it('returns every V1 state as a key, even when empty', () => {
		const groups = groupItemsByV1State([])
		for (const state of V1_STATE_ORDER) {
			expect(groups[state]).toEqual([])
		}
	})

	it('routes waiting / blocked / launchable items into the todo lane', () => {
		const items = [issueItem('waiting', 'A'), issueItem('blocked', 'B'), issueItem('launchable', 'C')]
		const groups = groupItemsByV1State(items)
		expect(groups.todo).toHaveLength(3)
		expect(groups.in_progress).toHaveLength(0)
	})

	it('routes runs into in_progress / needs_human / in_review / done', () => {
		const items = [runItem('active'), runItem('needs-human'), runItem('in-pr'), runItem('done')]
		const groups = groupItemsByV1State(items)
		expect(groups.in_progress).toHaveLength(1)
		expect(groups.needs_human).toHaveLength(1)
		expect(groups.in_review).toHaveLength(1)
		expect(groups.done).toHaveLength(1)
	})
})

describe('v1StateFromLinear (fallback path)', () => {
	it('maps every Linear state to a V1 state, collapsing canceled into done', () => {
		expect(v1StateFromLinear('backlog')).toBe('backlog')
		expect(v1StateFromLinear('unstarted')).toBe('todo')
		expect(v1StateFromLinear('started')).toBe('in_progress')
		expect(v1StateFromLinear('completed')).toBe('done')
		expect(v1StateFromLinear('canceled')).toBe('done')
	})
})

describe('v1StateForIssue', () => {
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
		expect(v1StateForIssue(baseIssue, buckets)).toBe('needs_human')
	})

	it('falls back to the Linear state when the issue is absent from the queue snapshot', () => {
		const buckets = new Map<string, LaunchQueue>()
		expect(v1StateForIssue(baseIssue, buckets)).toBe('in_progress')
	})
})
