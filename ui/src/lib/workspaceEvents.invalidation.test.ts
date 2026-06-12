import { queryKeys } from '@/lib/queryKeys'
import {
	invalidateForLaunchTaskNotice,
	invalidateForWorkspaceNotice
} from '@/lib/workspaceEvents.invalidation'
import type { LaunchTaskEvent, RunEvent, WorkspaceRunEvent } from '@/types'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

function makeClient(): QueryClient {
	return new QueryClient({
		defaultOptions: { queries: { gcTime: Infinity, staleTime: Infinity } }
	})
}

function seed(client: QueryClient, key: readonly unknown[], data: unknown = {}) {
	client.setQueryData(key as readonly string[], data)
}

function isInvalidated(client: QueryClient, key: readonly unknown[]): boolean {
	return client.getQueryState(key as readonly string[])?.isInvalidated === true
}

const RUN_ID = 'run-1'
const TASK_ID = 'task-1'
const ISSUE_ID = 'SUP-179'

function runStateChangeNotice(): WorkspaceRunEvent {
	const event: RunEvent = {
		id: 'evt-1',
		run_id: RUN_ID,
		run_step_id: null,
		seq: 0,
		ts: '2026-05-25T00:00:00Z',
		kind: 'state_change',
		level: 'info',
		message: 'run cancelled by operator',
		payload_json: null
	}
	return { type: 'run_event', ...event }
}

function shadowRunStateChangedNotice(): LaunchTaskEvent {
	return {
		kind: 'shadow_run_state_changed',
		task_id: TASK_ID,
		linear_issue_id: ISSUE_ID,
		run_id: RUN_ID,
		state: 'cancelled'
	}
}

function stepSessionLiveNotice(): LaunchTaskEvent {
	return {
		kind: 'step_session_live',
		task_id: TASK_ID,
		linear_issue_id: ISSUE_ID,
		step_id: 'step-1',
		run_id: RUN_ID,
		at: '2026-05-25T00:00:00Z'
	}
}

function interventionAddedNotice(): LaunchTaskEvent {
	return {
		kind: 'intervention_added',
		task_id: TASK_ID,
		linear_issue_id: ISSUE_ID,
		intervention_id: 'iv-1',
		target_step_id: null,
		body: 'try the other adapter',
		created_at: '2026-05-25T00:00:00Z'
	}
}

describe('invalidateForWorkspaceNotice — state_change', () => {
	it('invalidates run detail, runs list, issues list, and dashboard queue', () => {
		const client = makeClient()
		seed(client, queryKeys.runs.detail(RUN_ID))
		seed(client, queryKeys.runs.all)
		seed(client, queryKeys.issues.all)
		seed(client, queryKeys.dashboard.queue)

		invalidateForWorkspaceNotice(client, runStateChangeNotice())

		expect(isInvalidated(client, queryKeys.runs.detail(RUN_ID))).toBe(true)
		expect(isInvalidated(client, queryKeys.runs.all)).toBe(true)
		expect(isInvalidated(client, queryKeys.issues.all)).toBe(true)
		expect(isInvalidated(client, queryKeys.dashboard.queue)).toBe(true)
	})
})

describe('invalidateForLaunchTaskNotice — shadow_run_state_changed', () => {
	it('invalidates both task-side and run-side caches so cockpit/drawer flip live', () => {
		const client = makeClient()
		seed(client, queryKeys.launchTasks.detail(TASK_ID))
		seed(client, queryKeys.launchTasks.forIssue(ISSUE_ID))
		seed(client, queryKeys.runs.detail(RUN_ID))
		seed(client, queryKeys.runs.all)
		seed(client, queryKeys.issues.all)
		seed(client, queryKeys.dashboard.queue)

		invalidateForLaunchTaskNotice(client, shadowRunStateChangedNotice())

		expect(isInvalidated(client, queryKeys.launchTasks.detail(TASK_ID))).toBe(true)
		expect(isInvalidated(client, queryKeys.launchTasks.forIssue(ISSUE_ID))).toBe(true)
		expect(isInvalidated(client, queryKeys.runs.detail(RUN_ID))).toBe(true)
		expect(isInvalidated(client, queryKeys.runs.all)).toBe(true)
		expect(isInvalidated(client, queryKeys.issues.all)).toBe(true)
		expect(isInvalidated(client, queryKeys.dashboard.queue)).toBe(true)
	})
})

describe('invalidateForLaunchTaskNotice — step_session_live', () => {
	it('invalidates task detail/steps so the cockpit reflects the live session', () => {
		const client = makeClient()
		seed(client, queryKeys.launchTasks.detail(TASK_ID))
		seed(client, queryKeys.launchTasks.steps(TASK_ID))
		seed(client, queryKeys.launchTasks.forIssue(ISSUE_ID))
		seed(client, queryKeys.dashboard.queue)

		invalidateForLaunchTaskNotice(client, stepSessionLiveNotice())

		expect(isInvalidated(client, queryKeys.launchTasks.detail(TASK_ID))).toBe(true)
		expect(isInvalidated(client, queryKeys.launchTasks.steps(TASK_ID))).toBe(true)
		expect(isInvalidated(client, queryKeys.launchTasks.forIssue(ISSUE_ID))).toBe(true)
		expect(isInvalidated(client, queryKeys.dashboard.queue)).toBe(true)
	})
})

describe('invalidateForLaunchTaskNotice — intervention_added', () => {
	it('invalidates the interventions feed and the issue launch-task views', () => {
		const client = makeClient()
		seed(client, queryKeys.launchTasks.interventions(TASK_ID))
		seed(client, queryKeys.launchTasks.forIssue(ISSUE_ID))

		invalidateForLaunchTaskNotice(client, interventionAddedNotice())

		expect(isInvalidated(client, queryKeys.launchTasks.interventions(TASK_ID))).toBe(true)
		expect(isInvalidated(client, queryKeys.launchTasks.forIssue(ISSUE_ID))).toBe(true)
	})
})
