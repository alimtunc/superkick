import type { IssueWithState, LinearIssueListItem, Run, RunState } from '@/types'
import { describe, expect, it } from 'vitest'

import { taskBadgeKindFor } from './taskBadge'

const NOW = new Date('2026-05-21T12:00:00Z')
const SIX_DAYS_AGO = new Date(NOW.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString()
const TEN_DAYS_AGO = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString()

function makeRun(state: RunState): Run {
	return {
		id: 'r-1',
		issue_id: 'i-1',
		issue_identifier: 'SUP-1',
		repo_slug: 'r',
		state,
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
	}
}

interface IssueOverrides {
	runState?: RunState
	updated_at?: string
	completed_at?: string | null
}

function makeIssue(overrides: IssueOverrides = {}): IssueWithState {
	const issue: LinearIssueListItem = {
		id: 'i-1',
		identifier: 'SUP-1',
		title: 'Test',
		status: { state_type: 'started', name: 'In Progress', color: '#fff' },
		team_id: null,
		priority: { value: 2, label: 'High' },
		labels: [],
		assignee: null,
		project: null,
		parent: null,
		children: [],
		blocked_by: [],
		url: 'https://l',
		created_at: NOW.toISOString(),
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
					run: makeRun(overrides.runState),
					bucket: 'active',
					reason: '',
					pending_attention_count: 0,
					pending_interrupt_count: 0
				}
			: undefined
	}
}

describe('taskBadgeKindFor', () => {
	it('returns needs when bucket is needs', () => {
		expect(taskBadgeKindFor(makeIssue(), 'needs', NOW)).toBe('needs')
	})

	it('returns running when bucket is active', () => {
		expect(taskBadgeKindFor(makeIssue({ runState: 'coding' }), 'active', NOW)).toBe('running')
	})

	it('returns review when the linked run is reviewing', () => {
		expect(taskBadgeKindFor(makeIssue({ runState: 'reviewing' }), 'done', NOW)).toBe('review')
	})

	it('returns review when the linked run is opening_pr', () => {
		expect(taskBadgeKindFor(makeIssue({ runState: 'opening_pr' }), 'done', NOW)).toBe('review')
	})

	it('prefers needs over review when bucket is needs even with reviewing run', () => {
		expect(taskBadgeKindFor(makeIssue({ runState: 'reviewing' }), 'needs', NOW)).toBe('needs')
	})

	it('returns shipped when bucket is done and completed_at is within a week', () => {
		expect(taskBadgeKindFor(makeIssue({ completed_at: SIX_DAYS_AGO }), 'done', NOW)).toBe('shipped')
	})

	it('returns null when bucket is done but completed_at is more than a week ago', () => {
		expect(taskBadgeKindFor(makeIssue({ completed_at: TEN_DAYS_AGO }), 'done', NOW)).toBeNull()
	})

	it('returns null when bucket is done but completed_at is missing, even with recent updated_at', () => {
		expect(
			taskBadgeKindFor(makeIssue({ completed_at: null, updated_at: SIX_DAYS_AGO }), 'done', NOW)
		).toBeNull()
	})

	it('returns null for launchable / open with no run signal', () => {
		expect(taskBadgeKindFor(makeIssue(), 'launchable', NOW)).toBeNull()
		expect(taskBadgeKindFor(makeIssue(), 'open', NOW)).toBeNull()
	})
})
