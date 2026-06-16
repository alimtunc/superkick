import { useBrokerConnected } from '@/hooks/useBrokerConnection'
import { TERMINAL_LAUNCH_TASK_STATUSES } from '@/lib/domain'
import { toErrorMessage } from '@/lib/errors'
import { launchTaskEventBroker } from '@/lib/eventBroker'
import { launchTaskDetailQuery, launchTaskStepsQuery } from '@/lib/queries'
import type { LaunchTaskWithSteps } from '@/types'
import { useQuery } from '@tanstack/react-query'

interface UseLaunchTaskResult {
	view: LaunchTaskWithSteps | null
	loading: boolean
	error: string | null
}

export function useLaunchTask(taskId: string | null): UseLaunchTaskResult {
	const sseConnected = useBrokerConnected(launchTaskEventBroker)

	const detailQuery = useQuery({
		...launchTaskDetailQuery(taskId),
		refetchInterval: (query) => {
			if (sseConnected) return false
			const task = query.state.data
			if (!task) return false
			return TERMINAL_LAUNCH_TASK_STATUSES.has(task.status) ? false : 30_000
		}
	})

	const stepsQuery = useQuery({
		...launchTaskStepsQuery(taskId),
		refetchInterval: () => {
			if (sseConnected) return false
			const task = detailQuery.data
			if (!task || TERMINAL_LAUNCH_TASK_STATUSES.has(task.status)) return false
			return 30_000
		}
	})

	const loading = detailQuery.isLoading || stepsQuery.isLoading
	const error = toErrorMessage(detailQuery.error ?? stepsQuery.error)
	const view: LaunchTaskWithSteps | null =
		detailQuery.data && stepsQuery.data
			? {
					task: detailQuery.data,
					steps: stepsQuery.data.toSorted((a, b) => a.sequence - b.sequence)
				}
			: null

	return { view, loading, error }
}
