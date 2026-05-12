import { LaunchStepLinks } from '@/components/issue-detail/launch-task-feed/LaunchStepLinks'
import { LaunchTaskCancelButton } from '@/components/issue-detail/launch-task-feed/LaunchTaskCancelButton'
import { LaunchTaskNeedsHumanCallout } from '@/components/issue-detail/launch-task-feed/LaunchTaskNeedsHumanCallout'
import { Evidence } from '@/components/launch/Evidence'
import { LaunchPlanStrip } from '@/components/launch/LaunchPlanStrip'
import { Pill } from '@/components/ui/pill'
import {
	findBlockingContext,
	LAUNCH_STEP_KIND_LABEL,
	LAUNCH_STEP_MUTED_STATUSES,
	LAUNCH_STEP_STATUS_LABEL,
	LAUNCH_STEP_STATUS_TONE,
	TERMINAL_LAUNCH_TASK_STATUSES
} from '@/lib/domain'
import { evidenceKindForStep, evidenceMetaForStep } from '@/lib/launch/evidence'
import type { LaunchTask, LaunchTaskStep } from '@/types'

interface LaunchTaskFeedBodyProps {
	task: LaunchTask
	steps: readonly LaunchTaskStep[]
}

export function LaunchTaskFeedBody({ task, steps }: LaunchTaskFeedBodyProps) {
	const blocking = findBlockingContext(task, [...steps])
	const isTerminal = TERMINAL_LAUNCH_TASK_STATUSES.has(task.status)
	const canRetry = task.status === 'needs_human'

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
						canRetry={canRetry}
					/>
				) : null}
				{steps.map((step) => {
					const summary = step.summary?.trim()
					const meta = evidenceMetaForStep(step)
					const showLinks =
						step.linked_run_id ||
						step.linked_conversation_id ||
						step.linked_orchestrator_session_id
					return (
						<Evidence
							key={step.id}
							kind={evidenceKindForStep(step)}
							title={`${LAUNCH_STEP_KIND_LABEL[step.step_kind]} · ${step.agent_name}`}
							meta={meta}
							badge={
								<Pill
									tone={LAUNCH_STEP_STATUS_TONE[step.status]}
									size="sm"
									dot
									pulse={step.status === 'running'}
								>
									{LAUNCH_STEP_STATUS_LABEL[step.status]}
								</Pill>
							}
							muted={LAUNCH_STEP_MUTED_STATUSES.has(step.status)}
							body={
								summary || showLinks ? (
									<>
										{summary ? <p className="mb-2 leading-normal">{summary}</p> : null}
										{showLinks ? <LaunchStepLinks step={step} /> : null}
									</>
								) : null
							}
						/>
					)
				})}
				{!isTerminal ? (
					<div className="mt-2 flex items-center justify-end">
						<LaunchTaskCancelButton linearIssueId={task.linear_issue_id} taskId={task.id} />
					</div>
				) : null}
			</div>
		</div>
	)
}
