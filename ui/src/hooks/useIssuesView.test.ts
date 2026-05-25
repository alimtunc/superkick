import { EMPTY_FILTERS } from '@/lib/issues/searchParams'
import type { IssueWithState, LinearIssueListItem, LinearStateType, RunState } from '@/types'
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useIssuesView } from './useIssuesView'

const NOW = new Date('2026-05-21T12:00:00Z')
const VIEWER = 'viewer-1'

interface MakeIssueOverrides {
	identifier: string
	stateType?: LinearStateType
	assigneeId?: string | null
	priority?: number
	statusName?: string
	updated_at?: string
	created_at?: string
	completed_at?: string | null
	runState?: RunState
	childrenCount?: number
}

function makeIssue(overrides: MakeIssueOverrides): IssueWithState {
	const issue: LinearIssueListItem = {
		id: overrides.identifier,
		identifier: overrides.identifier,
		title: overrides.identifier,
		status: {
			state_type: overrides.stateType ?? 'unstarted',
			name: overrides.statusName ?? overrides.stateType ?? 'todo',
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
		children: childRefs(overrides.identifier, overrides.childrenCount ?? 0),
		blocked_by: [],
		url: 'https://l',
		created_at: overrides.created_at ?? NOW.toISOString(),
		updated_at: overrides.updated_at ?? NOW.toISOString(),
		completed_at: overrides.completed_at ?? null
	}
	return {
		issue,
		state: 'open',
		bucket: undefined,
		reason: undefined,
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

function childRefs(parentId: string, count: number): LinearIssueListItem['children'] {
	if (count <= 0) return []
	return Array.from({ length: count }, (_, idx) => ({
		id: `${parentId}-c${idx}`,
		identifier: `${parentId}-c${idx}`,
		title: `child ${idx}`,
		status: { state_type: 'unstarted', name: 'todo', color: '#fff' },
		priority: { value: 3, label: 'Medium' },
		labels: [],
		assignee: null,
		updated_at: NOW.toISOString()
	}))
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
			makeIssue({
				identifier: 'recent-done',
				stateType: 'completed',
				updated_at: sixDaysAgo,
				completed_at: sixDaysAgo
			})
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

	it('shipped tab shows only recently-shipped done issues using completed_at', () => {
		const sixDaysAgo = new Date(NOW.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString()
		const longAgo = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
		const r = render({
			issues: [
				makeIssue({
					identifier: 'recent',
					stateType: 'completed',
					completed_at: sixDaysAgo
				}),
				makeIssue({
					identifier: 'old',
					stateType: 'completed',
					completed_at: longAgo
				}),
				// Recently updated but no completed_at: must NOT appear in shipped.
				makeIssue({
					identifier: 'no-completion',
					stateType: 'completed',
					updated_at: sixDaysAgo,
					completed_at: null
				}),
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

	it('group=status uses Linear workflow order before alphabetical fallback', () => {
		const r = render({
			issues: [
				makeIssue({ identifier: 'A', stateType: 'backlog', statusName: 'Backlog' }),
				makeIssue({ identifier: 'B', stateType: 'started', statusName: 'In Progress' }),
				makeIssue({ identifier: 'C', stateType: 'started', statusName: 'Needs you' }),
				makeIssue({ identifier: 'D', stateType: 'started', statusName: 'In Review' }),
				makeIssue({ identifier: 'E', stateType: 'unstarted', statusName: 'Todo' })
			],
			viewerId: VIEWER,
			tab: 'all-open',
			filters: EMPTY_FILTERS,
			sort: 'updated',
			group: 'status',
			showDone: false,
			now: NOW
		})
		expect(r.groups.map((g) => g.label)).toEqual([
			'Needs you',
			'In Progress',
			'In Review',
			'Todo',
			'Backlog'
		])
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
				makeIssue({
					identifier: 'C',
					stateType: 'completed',
					completed_at: sixDaysAgo
				})
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

	it('list and kanban share the same filtered view-model', () => {
		const sixDaysAgo = new Date(NOW.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString()
		const issues = [
			makeIssue({ identifier: 'A', assigneeId: VIEWER, stateType: 'started' }),
			makeIssue({ identifier: 'B', assigneeId: 'other', stateType: 'unstarted' }),
			makeIssue({
				identifier: 'C',
				assigneeId: 'other',
				stateType: 'completed',
				completed_at: sixDaysAgo
			}),
			makeIssue({ identifier: 'D', runState: 'coding', stateType: 'started' })
		]

		const r = render({
			issues,
			viewerId: VIEWER,
			tab: 'mine',
			filters: { ...EMPTY_FILTERS, status_not: ['canceled'] },
			sort: 'updated',
			group: 'lifecycle',
			showDone: false,
			now: NOW
		})

		const listIds = new Set(r.groups.flatMap((g) => g.issues.map((w) => w.issue.identifier)))
		const boardIds = new Set(
			Object.values(r.boardColumns).flatMap((items) => items.map((w) => w.issue.identifier))
		)
		expect(boardIds).toEqual(listIds)
	})

	it('filters by updated window using updated_at', () => {
		const fiveDaysAgo = new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()
		const tenDaysAgo = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString()
		const r = render({
			issues: [
				makeIssue({ identifier: 'fresh', updated_at: fiveDaysAgo }),
				makeIssue({ identifier: 'stale', updated_at: tenDaysAgo })
			],
			viewerId: VIEWER,
			tab: 'all-open',
			filters: { ...EMPTY_FILTERS, updated: ['7d'] },
			sort: 'updated',
			group: 'lifecycle',
			showDone: false,
			now: NOW
		})
		expect(r.total).toBe(1)
		expect(r.groups[0].issues[0].issue.identifier).toBe('fresh')
	})

	it('filters by completed window using completed_at and ignores null', () => {
		const twoDaysAgo = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
		const fiveDaysAgo = new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()
		const r = render({
			issues: [
				makeIssue({
					identifier: 'in-window',
					stateType: 'completed',
					completed_at: twoDaysAgo
				}),
				makeIssue({
					identifier: 'outside-window',
					stateType: 'completed',
					completed_at: fiveDaysAgo
				}),
				makeIssue({
					identifier: 'no-completion',
					stateType: 'completed',
					completed_at: null,
					updated_at: twoDaysAgo
				})
			],
			viewerId: VIEWER,
			tab: 'shipped',
			filters: { ...EMPTY_FILTERS, completed: ['3d'] },
			sort: 'updated',
			group: 'lifecycle',
			showDone: false,
			now: NOW
		})
		expect(r.groups[0].issues.map((w) => w.issue.identifier)).toEqual(['in-window'])
	})

	it('filters by has_sub_issues = yes', () => {
		const r = render({
			issues: [
				makeIssue({ identifier: 'with-subs', childrenCount: 2 }),
				makeIssue({ identifier: 'no-subs' })
			],
			viewerId: VIEWER,
			tab: 'all-open',
			filters: { ...EMPTY_FILTERS, has_sub_issues: ['yes'] },
			sort: 'updated',
			group: 'lifecycle',
			showDone: false,
			now: NOW
		})
		expect(r.total).toBe(1)
		expect(r.groups[0].issues[0].issue.identifier).toBe('with-subs')
	})
})
