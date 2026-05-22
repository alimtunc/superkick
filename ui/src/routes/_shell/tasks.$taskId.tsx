import { TaskCockpit } from '@/components/task-cockpit/TaskCockpit'
import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
import { useLaunchTask } from '@/hooks/useLaunchTask'
import { launchTaskDetailQuery, launchTaskStepsQuery } from '@/lib/queries'
import { createRoute, useParams } from '@tanstack/react-router'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/tasks/$taskId',
	loader: ({ context, params }) =>
		Promise.all([
			context.queryClient.ensureQueryData(launchTaskDetailQuery(params.taskId)),
			context.queryClient.ensureQueryData(launchTaskStepsQuery(params.taskId))
		]),
	component: TaskDetailPage
})

function TaskDetailPage() {
	const { taskId } = useParams({ from: '/_shell/tasks/$taskId' })
	const { view, loading, error } = useLaunchTask(taskId)

	if (loading && !view) {
		return (
			<div className="px-6 py-6">
				<LoadingState rows={4} />
			</div>
		)
	}
	if (error && !view) {
		return (
			<div className="px-6 py-6">
				<ErrorState title="Launch task unavailable" message={error} />
			</div>
		)
	}
	if (!view) {
		return (
			<div className="px-6 py-6">
				<ErrorState title="Launch task not found" message={`No task with id ${taskId}.`} />
			</div>
		)
	}

	return <TaskCockpit task={view.task} steps={view.steps} />
}
