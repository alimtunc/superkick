import { invalidateAfterRunOrTaskStateChange } from '@/lib/queryInvalidation'
import { queryKeys } from '@/lib/queryKeys'
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

describe('invalidateAfterRunOrTaskStateChange', () => {
	it('always invalidates the cross-cutting trio (runs.all, issues.all, dashboard.queue)', () => {
		const client = makeClient()
		seed(client, queryKeys.runs.all)
		seed(client, queryKeys.issues.all)
		seed(client, queryKeys.dashboard.queue)

		invalidateAfterRunOrTaskStateChange(client, {})

		expect(isInvalidated(client, queryKeys.runs.all)).toBe(true)
		expect(isInvalidated(client, queryKeys.issues.all)).toBe(true)
		expect(isInvalidated(client, queryKeys.dashboard.queue)).toBe(true)
	})

	it('invalidates launchTasks.forIssue when issueId is provided', () => {
		const client = makeClient()
		seed(client, queryKeys.launchTasks.forIssue(ISSUE_ID))

		invalidateAfterRunOrTaskStateChange(client, { issueId: ISSUE_ID })

		expect(isInvalidated(client, queryKeys.launchTasks.forIssue(ISSUE_ID))).toBe(true)
	})

	it('invalidates launchTasks.detail + launchTasks.steps when taskId is provided', () => {
		const client = makeClient()
		seed(client, queryKeys.launchTasks.detail(TASK_ID))
		seed(client, queryKeys.launchTasks.steps(TASK_ID))

		invalidateAfterRunOrTaskStateChange(client, { taskId: TASK_ID })

		expect(isInvalidated(client, queryKeys.launchTasks.detail(TASK_ID))).toBe(true)
		expect(isInvalidated(client, queryKeys.launchTasks.steps(TASK_ID))).toBe(true)
	})

	it('invalidates runs.detail when runId is provided', () => {
		const client = makeClient()
		seed(client, queryKeys.runs.detail(RUN_ID))

		invalidateAfterRunOrTaskStateChange(client, { runId: RUN_ID })

		expect(isInvalidated(client, queryKeys.runs.detail(RUN_ID))).toBe(true)
	})

	it('leaves task-side gated keys untouched when no taskId is passed (runs.all + issues.all prefix-sweep still covers run/issue-scoped keys)', () => {
		const client = makeClient()
		seed(client, queryKeys.launchTasks.detail(TASK_ID))
		seed(client, queryKeys.launchTasks.steps(TASK_ID))

		invalidateAfterRunOrTaskStateChange(client, {})

		expect(isInvalidated(client, queryKeys.launchTasks.detail(TASK_ID))).toBe(false)
		expect(isInvalidated(client, queryKeys.launchTasks.steps(TASK_ID))).toBe(false)
	})
})
