import { useMemo } from 'react'

import { Pill, TabEmptyState } from '@/components/primitives'
import { LaunchTaskCompletionSummary } from '@/domains/issues/components/issue-detail/launch-task-feed/LaunchTaskCompletionSummary'
import { LaunchTaskNeedsHumanCallout } from '@/domains/issues/components/issue-detail/launch-task-feed/LaunchTaskNeedsHumanCallout'
import { LaunchPlanStrip } from '@/domains/launch/components/LaunchPlanStrip'
import { InterventionList } from '@/domains/launch/components/task-cockpit/InterventionList'
import { TaskCockpitNowPanel } from '@/domains/launch/components/task-cockpit/TaskCockpitNowPanel'
import { TaskCockpitParentBanner } from '@/domains/launch/components/task-cockpit/TaskCockpitParentBanner'
import { TaskSessionView } from '@/domains/launch/components/task-cockpit/TaskSessionView'
import { useLaunchTaskFeedState } from '@/hooks/useLaunchTaskFeedState'
import { LAUNCH_TASK_STATUS_LABEL, LAUNCH_TASK_STATUS_TONE, fmtRelativeTime } from '@/lib/domain'
import { TopbarBackButton } from '@/shell/TopbarBackButton'
import { usePageActions } from '@/shell/usePageActions'
import type { LaunchTask, LaunchTaskStep } from '@/types'
import { Terminal } from 'lucide-react'

interface TaskCockpitProps {
	task: LaunchTask
	steps: readonly LaunchTaskStep[]
}

export function TaskCockpit({ task, steps }: TaskCockpitProps) {
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
		pr,
		interventions
	} = useLaunchTaskFeedState(task, steps)

	const status = task.status
	const issueId = task.linear_issue_id.trim()
	const title = task.summary?.trim() || issueId || 'Launch task'
	const updated = fmtRelativeTime(task.updated_at)

	const sub = useMemo(
		() => (
			<>
				<Pill tone={LAUNCH_TASK_STATUS_TONE[status]} size="md" dot pulse={status === 'running'}>
					{LAUNCH_TASK_STATUS_LABEL[status]}
				</Pill>
				<span className="text-[12px] text-fg-dim">· updated {updated}</span>
			</>
		),
		[status, updated]
	)

	usePageActions({
		title,
		sub,
		back: <TopbarBackButton fallbackTo={issueId ? `/issues/${issueId}` : '/'} />
	})

	const hasInterventions = interventions.delivered.length > 0 || interventions.pending.length > 0

	return (
		<div className="flex h-full min-h-0 flex-col">
			<LaunchPlanStrip task={task} steps={steps} variant="stepper" />
			<TaskCockpitParentBanner task={task} />
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
			{blocking && !hideCallout ? (
				<div className="px-6 pt-5">
					<LaunchTaskNeedsHumanCallout
						linearIssueId={task.linear_issue_id}
						taskId={task.id}
						headline={blocking.headline}
						hint={blocking.hint}
						blockingStep={blocking.step}
						classification={blocking.classification}
						canRetry={canRetry}
					/>
				</div>
			) : null}
			{hasInterventions ? (
				<div className="border-b border-border px-6 py-3">
					<InterventionList
						label="Delivered interventions"
						rows={interventions.delivered}
						variant="above"
					/>
					<InterventionList
						label="Queued for next step"
						rows={interventions.pending}
						variant="below"
					/>
				</div>
			) : null}
			<div className="flex min-h-0 flex-1">
				{linkedRunId ? (
					<TaskSessionView task={task} runId={linkedRunId} steps={steps} />
				) : (
					<div className="min-h-0 flex-1">
						<TabEmptyState
							icon={Terminal}
							title="No session yet"
							description="The structured session appears once the first step starts a run."
						/>
					</div>
				)}
				<TaskCockpitNowPanel
					task={task}
					steps={steps}
					isTerminal={isTerminal}
					linkedRunId={linkedRunId}
					worktreePath={worktreePath}
					branchName={branchName}
					pr={pr}
				/>
			</div>
		</div>
	)
}
