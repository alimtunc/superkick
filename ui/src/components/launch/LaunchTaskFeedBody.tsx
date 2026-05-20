import { LaunchStepEvidenceRow } from '@/components/issue-detail/launch-task-feed/LaunchStepEvidenceRow'
import { LaunchStepFailureRow } from '@/components/issue-detail/launch-task-feed/LaunchStepFailureRow'
import { LaunchTaskCancelButton } from '@/components/issue-detail/launch-task-feed/LaunchTaskCancelButton'
import { LaunchTaskNeedsHumanCallout } from '@/components/issue-detail/launch-task-feed/LaunchTaskNeedsHumanCallout'
import { LaunchPlanStrip } from '@/components/launch/LaunchPlanStrip'
import { findBlockingContext, getDisposition, TERMINAL_LAUNCH_TASK_STATUSES } from '@/lib/domain'
import type { LaunchTask, LaunchTaskStep } from '@/types'

interface LaunchTaskFeedBodyProps {
	task: LaunchTask
	steps: readonly LaunchTaskStep[]
}

export function LaunchTaskFeedBody({ task, steps }: LaunchTaskFeedBodyProps) {
	const blocking = findBlockingContext(task, [...steps])
	const isTerminal = TERMINAL_LAUNCH_TASK_STATUSES.has(task.status)
	const canRetry =
		task.status === 'needs_human' &&
		(blocking?.classification ? getDisposition(blocking.classification) === 'needs_human' : true)

	return (
		<div className="flex h-full min-h-0 flex-col">
			<LaunchPlanStrip task={task} steps={steps} />
			<div className="flex-1 overflow-y-auto px-6 py-5">
				{blocking ? (
					<LaunchTaskNeedsHumanCallout
						linearIssueId={task.linear_issue_id}
						taskId={task.id}
						headline={blocking.headline}
						hint={blocking.hint}
						blockingStep={blocking.step}
						classification={blocking.classification}
						canRetry={canRetry}
					/>
				) : null}
				{steps.map((step) =>
					step.failure_classification ? (
						<LaunchStepFailureRow
							key={step.id}
							step={step}
							classification={step.failure_classification}
						/>
					) : (
						<LaunchStepEvidenceRow key={step.id} step={step} />
					)
				)}
				{!isTerminal ? (
					<div className="mt-2 flex items-center justify-end">
						<LaunchTaskCancelButton linearIssueId={task.linear_issue_id} taskId={task.id} />
					</div>
				) : null}
			</div>
		</div>
	)
}
