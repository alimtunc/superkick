import { LaunchTaskCancelButton } from '@/components/issue-detail/launch-task-feed/LaunchTaskCancelButton'
import { LaunchTaskCompletionSummary } from '@/components/issue-detail/launch-task-feed/LaunchTaskCompletionSummary'
import { LaunchTaskNeedsHumanCallout } from '@/components/issue-detail/launch-task-feed/LaunchTaskNeedsHumanCallout'
import { StepTimelineRow } from '@/components/issue-detail/launch-task-feed/StepTimelineRow'
import { IssueContextPanel } from '@/components/issues/IssueContextPanel'
import { InterventionComposer } from '@/components/launch/InterventionComposer'
import { InterventionRow } from '@/components/launch/InterventionRow'
import { LaunchPlanStrip } from '@/components/launch/LaunchPlanStrip'
import { WorktreeActions } from '@/components/workspace/WorktreeActions'
import { useLaunchTaskFeedState } from '@/hooks/useLaunchTaskFeedState'
import type { LaunchTask, LaunchTaskIntervention, LaunchTaskStep } from '@/types'

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
				<div className="border-b border-edge px-6 py-4">
					<IssueContextPanel issueId={task.linear_issue_id} variant="inline" />
				</div>
			) : null}
			<LaunchPlanStrip task={task} steps={steps} />
			{terminalKind ? (
				<LaunchTaskCompletionSummary
					kind={terminalKind}
					task={task}
					finalStep={finalStep}
					classification={finalClassification}
					linkedRunId={linkedRunId}
					worktreePath={worktreePath}
					branchName={branchName}
				/>
			) : linkedRunId ? (
				<WorktreeActions runId={linkedRunId} worktreePath={worktreePath} branchName={branchName} />
			) : null}
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

interface InterventionListProps {
	label: string
	rows: LaunchTaskIntervention[]
	variant: 'above' | 'below'
}

function InterventionList({ label, rows, variant }: InterventionListProps) {
	if (rows.length === 0) return null
	const spacing = variant === 'above' ? 'mb-4' : 'mt-4'
	return (
		<div className={spacing}>
			<div className="font-data mb-2 text-[11px] tracking-wide text-dim uppercase">{label}</div>
			{rows.map((i) => (
				<InterventionRow key={i.id} intervention={i} />
			))}
		</div>
	)
}
