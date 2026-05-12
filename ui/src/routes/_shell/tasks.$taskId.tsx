import { useMemo } from 'react'

import { LaunchTaskFeedBody } from '@/components/launch/LaunchTaskFeedBody'
import { Pill } from '@/components/ui/pill'
import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
import { useLaunchTask } from '@/hooks/useLaunchTask'
import { fmtRelativeTime, LAUNCH_TASK_STATUS_LABEL, LAUNCH_TASK_STATUS_TONE } from '@/lib/domain'
import { launchTaskDetailQuery, launchTaskStepsQuery } from '@/lib/queries'
import { usePageActions } from '@/shell/usePageActions'
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

	const title = view?.task.summary?.trim() || view?.task.linear_issue_id || 'Launch task'
	const status = view?.task.status ?? 'pending'

	usePageActions({
		title: title,
		sub: useMemo(() => {
			if (!view) return null
			const updated = fmtRelativeTime(view.task.updated_at)
			return (
				<>
					<Pill tone={LAUNCH_TASK_STATUS_TONE[status]} size="md" dot pulse={status === 'running'}>
						{LAUNCH_TASK_STATUS_LABEL[status]}
					</Pill>
					<span className="text-[12px] text-fg-dim">· updated {updated}</span>
				</>
			)
		}, [view, status])
	})

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

	return <LaunchTaskFeedBody task={view.task} steps={view.steps} />
}
