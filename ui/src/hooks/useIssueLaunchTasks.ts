import { fetchLaunchTaskSteps, listLaunchTasksForIssue } from '@/api'
import { useBrokerConnected } from '@/hooks/useBrokerConnection'
import { toErrorMessage } from '@/lib/errors'
import { launchTaskEventBroker } from '@/lib/eventBroker'
import { queryKeys } from '@/lib/queryKeys'
import type { LaunchTask, LaunchTaskWithSteps } from '@/types'
import { skipToken, useQuery } from '@tanstack/react-query'

const TERMINAL_TASK_STATUSES = new Set<LaunchTask['status']>(['completed', 'failed', 'cancelled'])

function isTerminal(task: LaunchTask): boolean {
	return TERMINAL_TASK_STATUSES.has(task.status)
}

function sortByUpdatedDesc(tasks: LaunchTask[]): LaunchTask[] {
	return tasks.toSorted((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
}

/**
 * Most-recently-updated non-terminal task. Drives the launcher / active-panel
 * toggle on Issue Detail — returns null once every task has finished so the
 * operator can launch a new one. v1 only renders a single in-flight task per
 * issue.
 */
export function pickActiveTask(tasks: LaunchTask[]): LaunchTask | null {
	if (tasks.length === 0) return null
	return sortByUpdatedDesc(tasks).find((t) => !isTerminal(t)) ?? null
}

/**
 * Most relevant task to render in the feed: the active task if one exists,
 * otherwise the newest terminal one so the operator can still see what
 * happened last.
 */
function pickDisplayTask(tasks: LaunchTask[]): LaunchTask | null {
	if (tasks.length === 0) return null
	const sorted = sortByUpdatedDesc(tasks)
	return sorted.find((t) => !isTerminal(t)) ?? sorted[0]
}

interface UseIssueLaunchTasksResult {
	/** All tasks for the issue, in the order returned by the API. */
	tasks: LaunchTask[]
	/** Non-terminal task driving the launcher vs panel toggle, or null. */
	activeTask: LaunchTask | null
	/** Task + ordered steps for the feed (history-tolerant). */
	view: LaunchTaskWithSteps | null
	loading: boolean
	error: string | null
}

/**
 * SUP-117 / SUP-123 — single source of truth for launch-task data on an issue.
 * Subscribes to the launch-task SSE broker via cache invalidation
 * (`WorkspaceEventsProvider`), and falls back to slow polling only while SSE is
 * disconnected so the two paths never compete.
 */
export function useIssueLaunchTasks(issueIdentifier: string): UseIssueLaunchTasksResult {
	const sseConnected = useBrokerConnected(launchTaskEventBroker)

	const tasksQuery = useQuery({
		queryKey: queryKeys.launchTasks.forIssue(issueIdentifier),
		queryFn: () => listLaunchTasksForIssue(issueIdentifier),
		staleTime: 5_000,
		refetchInterval: (query) => {
			if (sseConnected) return false
			const tasks = query.state.data
			if (!tasks || tasks.length === 0) return 60_000
			const active = pickActiveTask(tasks)
			return active ? 30_000 : 60_000
		}
	})

	const tasks = tasksQuery.data ?? []
	const activeTask = pickActiveTask(tasks)
	const displayTask = pickDisplayTask(tasks)
	const stepsTaskId = displayTask?.id ?? null

	const stepsQuery = useQuery({
		queryKey: queryKeys.launchTasks.steps(stepsTaskId ?? '__pending__'),
		queryFn: stepsTaskId ? () => fetchLaunchTaskSteps(stepsTaskId) : skipToken,
		staleTime: 5_000,
		refetchInterval: () => {
			if (sseConnected) return false
			if (!displayTask || isTerminal(displayTask)) return false
			return 30_000
		}
	})

	const loading = tasksQuery.isLoading || (stepsTaskId !== null && stepsQuery.isLoading)
	const error = toErrorMessage(tasksQuery.error ?? stepsQuery.error)

	const view: LaunchTaskWithSteps | null =
		displayTask && stepsQuery.data
			? {
					task: displayTask,
					steps: stepsQuery.data.toSorted((a, b) => a.sequence - b.sequence)
				}
			: null

	return { tasks, activeTask, view, loading, error }
}
