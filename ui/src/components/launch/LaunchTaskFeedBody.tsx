import { LaunchTaskCancelButton } from '@/components/issue-detail/launch-task-feed/LaunchTaskCancelButton'
import { LaunchTaskNeedsHumanCallout } from '@/components/issue-detail/launch-task-feed/LaunchTaskNeedsHumanCallout'
import { StepTimelineRow } from '@/components/issue-detail/launch-task-feed/StepTimelineRow'
import { IssueContextPanel } from '@/components/issues/IssueContextPanel'
import { LaunchPlanStrip } from '@/components/launch/LaunchPlanStrip'
import { WorktreeActions } from '@/components/workspace/WorktreeActions'
import { findBlockingContext, getDisposition, TERMINAL_LAUNCH_TASK_STATUSES } from '@/lib/domain'
import { runDetailQuery } from '@/lib/queries'
import type { LaunchTask, LaunchTaskStep } from '@/types'
import { useQuery } from '@tanstack/react-query'

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

	const hasLinearIssue = task.linear_issue_id.trim().length > 0

	const linkedRunId = steps.find((s) => s.linked_run_id)?.linked_run_id ?? null
	const runDetail = useQuery(runDetailQuery(linkedRunId))
	const worktreePath = runDetail.data?.run.worktree_path ?? null
	const branchName = runDetail.data?.run.branch_name ?? null

	return (
		<div className="flex h-full min-h-0 flex-col">
			{hasLinearIssue ? (
				<div className="border-b border-edge px-6 py-4">
					<IssueContextPanel issueId={task.linear_issue_id} variant="inline" />
				</div>
			) : null}
			<LaunchPlanStrip task={task} steps={steps} />
			{linkedRunId ? (
				<WorktreeActions runId={linkedRunId} worktreePath={worktreePath} branchName={branchName} />
			) : null}
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
				{steps.map((step) => (
					<StepTimelineRow key={step.id} step={step} task={task} />
				))}
				{!isTerminal ? (
					<div className="mt-2 flex items-center justify-end">
						<LaunchTaskCancelButton linearIssueId={task.linear_issue_id} taskId={task.id} />
					</div>
				) : null}
			</div>
		</div>
	)
}
