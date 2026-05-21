import { EMPTY_FILTERS } from '@/lib/issues/searchParams'
import type { IssueWithState, LinearIssueListItem, LinearStateType, RunState } from '@/types'
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useIssuesView } from './useIssuesView'

const NOW = new Date('2026-05-21T12:00:00Z')
const VIEWER = 'viewer-1'

function makeIssue(overrides: {
	identifier: string
	stateType?: LinearStateType
	assigneeId?: string | null
	priority?: number
	updated_at?: string
	created_at?: string
	runState?: RunState
}): IssueWithState {
	const issue: LinearIssueListItem = {
		id: overrides.identifier,
		identifier: overrides.identifier,
		title: overrides.identifier,
		status: {
			state_type: overrides.stateType ?? 'unstarted',
			name: overrides.stateType ?? 'todo',
			color: '#fff'
		},
		team_id: null,
		priority: { value: overrides.priority ?? 2, label: 'High' },
		labels: [],
		assignee:
			overrides.assigneeId === null || overrides.assigneeId === undefined
				? null
				: { id: overrides.assigneeId, name: overrides.assigneeId, avatar_url: null },
		project: null,
		parent: null,
		children: [],
		blocked_by: [],
		url: 'https://l',
		created_at: overrides.created_at ?? NOW.toISOString(),
		updated_at: overrides.updated_at ?? NOW.toISOString()
	}
	return {
		issue,
		state: 'open',
		bucket: undefined,
		linkedRun: overrides.runState
			? {
					kind: 'run',
					run: {
						id: 'r',
						issue_id: issue.id,
						issue_identifier: issue.identifier,
						repo_slug: 'r',
						state: overrides.runState,
						trigger_source: 'manual',
						current_step_key: null,
						base_branch: null,
						worktree_path: null,
						branch_name: null,
						operator_instructions: null,
						started_at: NOW.toISOString(),
						updated_at: NOW.toISOString(),
						finished_at: null,
						error_message: null,
						budget: { duration_secs: null, retries_max: null, token_ceiling: null },
						pause_kind: 'none',
						pause_reason: null
					},
					bucket: 'active',
					reason: '',
					pending_attention_count: 0,
					pending_interrupt_count: 0
				}
			: undefined
	}
}

function render(input: Parameters<typeof useIssuesView>[0]) {
	return renderHook(() => useIssuesView(input)).result.current
}

describe('useIssuesView', () => {
	it('groups by lifecycle in canonical order and drops empty buckets', () => {
		const r = render({
			issues: [
				makeIssue({ identifier: 'A', runState: 'waiting_human' }),
				makeIssue({ identifier: 'B', runState: 'coding' }),
				makeIssue({ identifier: 'C', stateType: 'started', assigneeId: VIEWER })
			],
			viewerId: VIEWER,
			tab: 'all-open',
			filters: EMPTY_FILTERS,
			sort: 'updated',
			group: 'lifecycle',
			showDone: false,
			now: NOW
		})
		expect(r.groups.map((g) => g.bucket)).toEqual(['needs', 'active', 'launchable'])
	})

	it('mine tab filters to viewer-assigned open issues only', () => {
		const r = render({
			issues: [
				makeIssue({ identifier: 'mine', assigneeId: VIEWER }),
				makeIssue({ identifier: 'theirs', assigneeId: 'other' })
			],
			viewerId: VIEWER,
			tab: 'mine',
			filters: EMPTY_FILTERS,
			sort: 'updated',
			group: 'lifecycle',
			showDone: false,
			now: NOW
		})
		expect(r.total).toBe(1)
		expect(r.groups[0].issues[0].issue.identifier).toBe('mine')
	})

	it('mine tab degrades to all-open when viewerId is null', () => {
		const r = render({
			issues: [
				makeIssue({ identifier: 'mine', assigneeId: VIEWER }),
				makeIssue({ identifier: 'theirs', assigneeId: 'other' })
			],
			viewerId: null,
			tab: 'mine',
			filters: EMPTY_FILTERS,
			sort: 'updated',
			group: 'lifecycle',
			showDone: false,
			now: NOW
		})
		expect(r.total).toBe(2)
	})

	it('hides done by default and reveals it when showDone is true', () => {
		const sixDaysAgo = new Date(NOW.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString()
		const issues = [
			makeIssue({ identifier: 'open', stateType: 'unstarted' }),
			makeIssue({ identifier: 'recent-done', stateType: 'completed', updated_at: sixDaysAgo })
		]
		const hidden = render({
			issues,
			viewerId: VIEWER,
			tab: 'all-open',
			filters: EMPTY_FILTERS,
			sort: 'updated',
			group: 'lifecycle',
			showDone: false,
			now: NOW
		})
		expect(hidden.groups.map((g) => g.bucket)).toEqual(['open'])
		expect(hidden.doneCountThisWeek).toBe(1)

		const shown = render({
			issues,
			viewerId: VIEWER,
			tab: 'all-open',
			filters: EMPTY_FILTERS,
			sort: 'updated',
			group: 'lifecycle',
			showDone: true,
			now: NOW
		})
		expect(shown.groups.map((g) => g.bucket)).toEqual(['open', 'done'])
	})

	it('shipped tab shows only recently-shipped done issues', () => {
		const sixDaysAgo = new Date(NOW.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString()
		const longAgo = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
		const r = render({
			issues: [
				makeIssue({ identifier: 'recent', stateType: 'completed', updated_at: sixDaysAgo }),
				makeIssue({ identifier: 'old', stateType: 'completed', updated_at: longAgo }),
				makeIssue({ identifier: 'open' })
			],
			viewerId: VIEWER,
			tab: 'shipped',
			filters: EMPTY_FILTERS,
			sort: 'updated',
			group: 'lifecycle',
			showDone: false,
			now: NOW
		})
		expect(r.groups[0].bucket).toBe('done')
		expect(r.groups[0].issues.map((w) => w.issue.identifier)).toEqual(['recent'])
	})

	it('group=status uses status name and sorts alphabetically', () => {
		const r = render({
			issues: [
				makeIssue({ identifier: 'A', stateType: 'unstarted' }),
				makeIssue({ identifier: 'B', stateType: 'started', assigneeId: VIEWER })
			],
			viewerId: VIEWER,
			tab: 'all-open',
			filters: EMPTY_FILTERS,
			sort: 'updated',
			group: 'status',
			showDone: false,
			now: NOW
		})
		expect(r.groups.map((g) => g.label)).toEqual(['started', 'unstarted'])
	})

	it('applies the assignee filter on the viewer-aware id', () => {
		const r = render({
			issues: [
				makeIssue({ identifier: 'A', assigneeId: VIEWER }),
				makeIssue({ identifier: 'B', assigneeId: 'other' })
			],
			viewerId: VIEWER,
			tab: 'all-open',
			filters: { ...EMPTY_FILTERS, assignee: ['other'] },
			sort: 'updated',
			group: 'lifecycle',
			showDone: false,
			now: NOW
		})
		expect(r.total).toBe(1)
		expect(r.groups[0].issues[0].issue.identifier).toBe('B')
	})

	it('exposes tab counts that ignore filters', () => {
		const sixDaysAgo = new Date(NOW.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString()
		const r = render({
			issues: [
				makeIssue({ identifier: 'A', assigneeId: VIEWER }),
				makeIssue({ identifier: 'B', assigneeId: 'other' }),
				makeIssue({ identifier: 'C', stateType: 'completed', updated_at: sixDaysAgo })
			],
			viewerId: VIEWER,
			tab: 'all-open',
			filters: { ...EMPTY_FILTERS, assignee: ['other'] },
			sort: 'updated',
			group: 'lifecycle',
			showDone: false,
			now: NOW
		})
		expect(r.tabCounts).toEqual({ mine: 1, 'all-open': 2, shipped: 1 })
	})
})
