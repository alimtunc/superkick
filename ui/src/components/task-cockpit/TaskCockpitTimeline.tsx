import { LaunchTaskCompletionSummary } from '@/components/issue-detail/launch-task-feed/LaunchTaskCompletionSummary'
import { LaunchTaskNeedsHumanCallout } from '@/components/issue-detail/launch-task-feed/LaunchTaskNeedsHumanCallout'
import { StepTimelineRow } from '@/components/issue-detail/launch-task-feed/StepTimelineRow'
import { hasStructuredActivity } from '@/components/run-tabs/structuredActivity'
import { StructuredActivityList } from '@/components/run-tabs/StructuredActivityList'
import { InterventionList } from '@/components/task-cockpit/InterventionList'
import { LAUNCH_STEP_KIND_LABEL } from '@/lib/domain'
import type {
	BlockingContext,
	FailureClassification,
	LaunchTask,
	LaunchTaskIntervention,
	LaunchTaskStep,
	RunEvent,
	TerminalKind
} from '@/types'
import { ChevronRight } from 'lucide-react'

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
	runEvents: RunEvent[]
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
	interventions,
	runEvents
}: TaskCockpitTimelineProps) {
	const structured = hasStructuredActivity(runEvents)

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
				{structured ? (
					<StructuredTaskActivity task={task} steps={steps} runEvents={runEvents} />
				) : (
					<>
						<InterventionList
							label="Delivered interventions"
							rows={interventions.delivered}
							variant="above"
						/>
						{steps.map((step) => (
							<StepTimelineRow key={step.id} step={step} task={task} />
						))}
						<InterventionList
							label="Queued for next step"
							rows={interventions.pending}
							variant="below"
						/>
					</>
				)}
			</div>
		</div>
	)
}

function StructuredTaskActivity({
	task,
	steps,
	runEvents
}: {
	task: LaunchTask
	steps: readonly LaunchTaskStep[]
	runEvents: RunEvent[]
}) {
	const plan = steps.find((step) => step.step_kind === 'plan')
	const implement = steps.find((step) => step.step_kind === 'implement')
	const review = steps.find((step) => step.step_kind === 'review')
	const done = steps.filter((step) => step.status === 'completed').length
	const total = steps.length

	return (
		<div className="space-y-4">
			{plan ? (
				<PhaseLine
					step={plan}
					trailing={
						plan.status === 'completed' ? 'drafted 5 steps · auto-approved · 32s' : undefined
					}
				/>
			) : null}
			{implement ? (
				<section>
					<div className="mb-3 flex items-center gap-2 rounded-md bg-raised px-3 py-2">
						<ChevronRight
							size={13}
							strokeWidth={1.85}
							className="text-fg-dim"
							aria-hidden="true"
						/>
						<span className="font-data text-[11px] font-semibold tracking-wider text-accent uppercase">
							{LAUNCH_STEP_KIND_LABEL[implement.step_kind]}
						</span>
						<span className="font-data text-[11px] text-fg-dim">
							{done} of {total} steps · editing verify.go
						</span>
					</div>
					<StructuredActivityList events={runEvents} className="pl-3" />
				</section>
			) : null}
			{review ? (
				<PhaseLine
					step={review}
					trailing={task.status === 'completed' ? 'ready for PR' : 'will open PR once edit lands'}
				/>
			) : null}
		</div>
	)
}

function PhaseLine({ step, trailing }: { step: LaunchTaskStep; trailing?: string }) {
	return (
		<div className="flex items-center gap-2 text-[12px] text-fg-muted">
			<ChevronRight size={13} strokeWidth={1.85} className="text-fg-dim" aria-hidden="true" />
			<span className="font-data text-[11px] font-semibold tracking-wider text-success uppercase">
				{LAUNCH_STEP_KIND_LABEL[step.step_kind]}
			</span>
			{trailing ? <span>· {trailing}</span> : null}
		</div>
	)
}
