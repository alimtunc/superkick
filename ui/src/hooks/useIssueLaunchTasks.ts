import { fetchLaunchTaskSteps, listLaunchTasksForIssue } from '@/api'
import { queryKeys } from '@/lib/queryKeys'
import type { LaunchTask, LaunchTaskWithSteps } from '@/types'
import { skipToken, useQuery } from '@tanstack/react-query'

const TERMINAL_TASK_STATUSES = new Set<LaunchTask['status']>(['completed', 'failed', 'cancelled'])

/**
 * Pick the most relevant launch task for an issue: the most-recently-updated
 * non-terminal task wins, otherwise the most-recently-updated terminal one
 * (operator still wants to see history). v1 only renders a single task per
 * issue — multi-task views are out of scope.
 */
function pickActiveTask(tasks: LaunchTask[]): LaunchTask | null {
	if (tasks.length === 0) return null
	const sorted = tasks.toSorted(
		(a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
	)
	const nonTerminal = sorted.find((t) => !TERMINAL_TASK_STATUSES.has(t.status))
	return nonTerminal ?? sorted[0]
}

function formatQueryError(err: unknown): string | null {
	if (err instanceof Error) return err.message
	if (err != null) return String(err)
	return null
}

interface UseIssueLaunchTasksResult {
	view: LaunchTaskWithSteps | null
	loading: boolean
	error: string | null
}

/**
 * Compose the launch-task feed view for a single issue: list tasks for the
 * issue, pick the active one, then fetch its ordered steps. Polls every 8s
 * while the parent task is non-terminal — SUP-118 will replace polling with
 * SSE and this hook is the single seam to swap.
 */
export function useIssueLaunchTasks(issueIdentifier: string): UseIssueLaunchTasksResult {
	const tasksQuery = useQuery({
		queryKey: queryKeys.launchTasks.forIssue(issueIdentifier),
		queryFn: () => listLaunchTasksForIssue(issueIdentifier),
		staleTime: 5_000,
		refetchInterval: (query) => {
			const tasks = query.state.data
			if (!tasks || tasks.length === 0) return 30_000
			const active = pickActiveTask(tasks)
			if (!active) return 30_000
			return TERMINAL_TASK_STATUSES.has(active.status) ? false : 8_000
		}
	})

	const activeTask = tasksQuery.data ? pickActiveTask(tasksQuery.data) : null
	const taskId = activeTask?.id ?? null

	const stepsQuery = useQuery({
		queryKey: queryKeys.launchTasks.steps(taskId ?? '__pending__'),
		queryFn: taskId ? () => fetchLaunchTaskSteps(taskId) : skipToken,
		staleTime: 5_000,
		refetchInterval: () => {
			if (!activeTask) return false
			return TERMINAL_TASK_STATUSES.has(activeTask.status) ? false : 8_000
		}
	})

	const loading = tasksQuery.isLoading || (taskId !== null && stepsQuery.isLoading)
	const error = formatQueryError(tasksQuery.error ?? stepsQuery.error)

	const view: LaunchTaskWithSteps | null =
		activeTask && stepsQuery.data
			? {
					task: activeTask,
					steps: stepsQuery.data.toSorted((a, b) => a.sequence - b.sequence)
				}
			: null

	return { view, loading, error }
}
