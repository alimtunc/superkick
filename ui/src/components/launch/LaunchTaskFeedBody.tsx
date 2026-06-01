import { LaunchTaskCancelButton } from '@/components/issue-detail/launch-task-feed/LaunchTaskCancelButton'
import { LaunchTaskNeedsHumanCallout } from '@/components/issue-detail/launch-task-feed/LaunchTaskNeedsHumanCallout'
import { StepTimelineRow } from '@/components/issue-detail/launch-task-feed/StepTimelineRow'
import { IssueContextPanel } from '@/components/issues/IssueContextPanel'
import { InterventionComposer } from '@/components/launch/InterventionComposer'
import { LaunchPlanStrip } from '@/components/launch/LaunchPlanStrip'
import { LaunchTaskTerminalSection } from '@/components/launch/LaunchTaskTerminalSection'
import { InterventionList } from '@/components/task-cockpit/InterventionList'
import { useLaunchTaskFeedState } from '@/hooks/useLaunchTaskFeedState'
import type { LaunchTask, LaunchTaskStep } from '@/types'

interface LaunchTaskFeedBodyProps {
	task: LaunchTask
	steps: readonly LaunchTaskStep[]
}

export function LaunchTaskFeedBody({ task, steps }: LaunchTaskFeedBodyProps) {
	const {
		blocking,
		canRetry,
		isTerminal,
		terminalKind,
		hideCallout,
		finalStep,
		finalClassification,
		linkedRunId,
		worktreePath,
		branchName,
		interventions
	} = useLaunchTaskFeedState(task, steps)

	const hasLinearIssue = task.linear_issue_id.trim().length > 0

	return (
		<div className="flex h-full min-h-0 flex-col">
			{hasLinearIssue ? (
				<div className="border-b border-border px-6 py-4">
					<IssueContextPanel issueId={task.linear_issue_id} variant="inline" />
				</div>
			) : null}
			<LaunchPlanStrip task={task} steps={steps} />
			<LaunchTaskTerminalSection
				task={task}
				terminalKind={terminalKind}
				finalStep={finalStep}
				finalClassification={finalClassification}
				linkedRunId={linkedRunId}
				worktreePath={worktreePath}
				branchName={branchName}
			/>
			<InterventionComposer
				linearIssueId={task.linear_issue_id}
				taskId={task.id}
				disabled={isTerminal}
			/>
			<div className="flex-1 overflow-y-auto px-6 py-5">
				{blocking && !hideCallout ? (
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
				<InterventionList
					label="Delivered interventions"
					rows={interventions.delivered}
					variant="above"
				/>
				{steps.map((step) => (
					<StepTimelineRow key={step.id} step={step} task={task} />
				))}
				<InterventionList label="Queued for next step" rows={interventions.pending} variant="below" />
				{!isTerminal ? (
					<div className="mt-2 flex items-center justify-end">
						<LaunchTaskCancelButton
							linearIssueId={task.linear_issue_id}
							taskId={task.id}
							linkedRunId={linkedRunId ?? undefined}
						/>
					</div>
				) : null}
			</div>
		</div>
	)
}
