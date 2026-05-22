import { LaunchTaskCompletionSummary } from '@/components/issue-detail/launch-task-feed/LaunchTaskCompletionSummary'
import { LaunchTaskNeedsHumanCallout } from '@/components/issue-detail/launch-task-feed/LaunchTaskNeedsHumanCallout'
import { StepTimelineRow } from '@/components/issue-detail/launch-task-feed/StepTimelineRow'
import { InterventionList } from '@/components/task-cockpit/InterventionList'
import type {
	BlockingContext,
	FailureClassification,
	LaunchTask,
	LaunchTaskIntervention,
	LaunchTaskStep,
	TerminalKind
} from '@/types'

interface TaskCockpitTimelineProps {
	task: LaunchTask
	steps: readonly LaunchTaskStep[]
	blocking: BlockingContext | null
	canRetry: boolean
	terminalKind: TerminalKind | null
	hideCallout: boolean
	finalStep: LaunchTaskStep | null
	finalClassification: FailureClassification | null
	linkedRunId: string | null
	worktreePath: string | null
	branchName: string | null
	interventions: {
		delivered: LaunchTaskIntervention[]
		pending: LaunchTaskIntervention[]
	}
}

export function TaskCockpitTimeline({
	task,
	steps,
	blocking,
	canRetry,
	terminalKind,
	hideCallout,
	finalStep,
	finalClassification,
	linkedRunId,
	worktreePath,
	branchName,
	interventions
}: TaskCockpitTimelineProps) {
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
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
			) : null}
			<div className="px-6 py-5">
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
			</div>
		</div>
	)
}
