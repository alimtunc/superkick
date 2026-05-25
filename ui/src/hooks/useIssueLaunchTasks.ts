import { fetchLaunchTaskSteps, listLaunchTasksForIssue } from '@/api'
import { useBrokerConnected } from '@/hooks/useBrokerConnection'
import { TERMINAL_LAUNCH_TASK_STATUSES } from '@/lib/domain'
import { toErrorMessage } from '@/lib/errors'
import { launchTaskEventBroker } from '@/lib/eventBroker'
import { queryKeys } from '@/lib/queryKeys'
import type { LaunchTask, LaunchTaskWithSteps } from '@/types'
import { useQueries, useQuery } from '@tanstack/react-query'

// Cap on tasks hydrated with steps; beyond this, deep-link to /tasks/$id.
const HISTORY_CAP = 10

function isTerminal(task: LaunchTask): boolean {
	return TERMINAL_LAUNCH_TASK_STATUSES.has(task.status)
}

function sortByUpdatedDesc(tasks: LaunchTask[]): LaunchTask[] {
	return tasks.toSorted((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
}

export function pickActiveTask(tasks: LaunchTask[]): LaunchTask | null {
	if (tasks.length === 0) return null
	return sortByUpdatedDesc(tasks).find((t) => !isTerminal(t)) ?? null
}

interface UseIssueLaunchTasksResult {
	tasks: LaunchTask[]
	activeTask: LaunchTask | null
	tasksWithSteps: LaunchTaskWithSteps[]
	loading: boolean
	error: string | null
}

// Single source of truth for launch-task data on an issue; SSE invalidation
// (WorkspaceEventsProvider) drives refresh, with slow polling as fallback.
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
	const recent = sortByUpdatedDesc(tasks).slice(0, HISTORY_CAP)

	const stepResults = useQueries({
		queries: recent.map((task) => ({
			queryKey: queryKeys.launchTasks.steps(task.id),
			queryFn: () => fetchLaunchTaskSteps(task.id),
			staleTime: 5_000,
			refetchInterval: () => {
				if (sseConnected) return false
				return isTerminal(task) ? false : 30_000
			}
		}))
	})

	const tasksWithSteps: LaunchTaskWithSteps[] = recent
		.map((task, index) => {
			const data = stepResults[index]?.data
			if (!data) return null
			return { task, steps: data.toSorted((a, b) => a.sequence - b.sequence) }
		})
		.filter((entry): entry is LaunchTaskWithSteps => entry !== null)

	const stepsLoading = stepResults.some((q) => q.isLoading)
	const loading = tasksQuery.isLoading || (recent.length > 0 && stepsLoading && tasksWithSteps.length === 0)
	const error =
		toErrorMessage(tasksQuery.error) ?? toErrorMessage(stepResults.find((q) => q.error)?.error) ?? null

	return { tasks, activeTask, tasksWithSteps, loading, error }
}
