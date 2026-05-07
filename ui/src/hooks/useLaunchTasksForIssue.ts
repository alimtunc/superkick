import { launchTasksForIssueQuery } from '@/lib/queries'
import type { LaunchTask, LaunchTaskStatus } from '@/types'
import { useQuery } from '@tanstack/react-query'

const ACTIVE_STATUSES: readonly LaunchTaskStatus[] = ['pending', 'running', 'needs_human']

/**
 * SUP-117 — list launch tasks scoped to a Linear issue. The query is keyed on
 * `linearIssueId` so navigating between issues is a cheap cache lookup. When
 * an active task is present we poll lightly so the "Launch Task active"
 * panel reflects step progress without an event subscription (deferred).
 */
export function useLaunchTasksForIssue(linearIssueId: string | null) {
	const query = useQuery({
		...launchTasksForIssueQuery(linearIssueId),
		refetchInterval: (q) => {
			const tasks = (q.state.data ?? []) as LaunchTask[]
			const hasActive = tasks.some((t) => ACTIVE_STATUSES.includes(t.status))
			return hasActive ? 5_000 : false
		}
	})

	const tasks: LaunchTask[] = query.data ?? []
	const activeTask =
		tasks.find((t) => ACTIVE_STATUSES.includes(t.status)) ??
		tasks.find((t) => t.status !== 'cancelled') ??
		null

	return { ...query, tasks, activeTask }
}
