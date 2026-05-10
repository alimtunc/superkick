import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
import { useIssueLaunchTasks } from '@/hooks/useIssueLaunchTasks'
import { TERMINAL_LAUNCH_TASK_STATUSES, findBlockingContext, fmtRelativeTime } from '@/lib/domain'

import { LaunchStepRow } from './LaunchStepRow'
import { LaunchTaskCancelButton } from './LaunchTaskCancelButton'
import { LaunchTaskEmptyState } from './LaunchTaskEmptyState'
import { LaunchTaskNeedsHumanCallout } from './LaunchTaskNeedsHumanCallout'
import { LaunchTaskShell } from './LaunchTaskShell'
import { LaunchTaskStatusBadge } from './LaunchTaskStatusBadge'

interface LaunchTaskFeedProps {
	issueIdentifier: string
}

export function LaunchTaskFeed({ issueIdentifier }: LaunchTaskFeedProps) {
	const { view, loading, error } = useIssueLaunchTasks(issueIdentifier)

	if (loading && !view) {
		return (
			<LaunchTaskShell>
				<LoadingState rows={3} density="compact" />
			</LaunchTaskShell>
		)
	}

	if (error && !view) {
		return (
			<LaunchTaskShell>
				<ErrorState density="compact" title="Failed to load launch task" message={error} />
			</LaunchTaskShell>
		)
	}

	if (!view) {
		return (
			<LaunchTaskShell>
				<LaunchTaskEmptyState />
			</LaunchTaskShell>
		)
	}

	const { task, steps } = view
	const blocking = findBlockingContext(task, steps)
	const summary = task.summary?.trim() || null
	const isTerminal = TERMINAL_LAUNCH_TASK_STATUSES.has(task.status)
	const canRetry = task.status === 'needs_human'

	return (
		<LaunchTaskShell>
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
			<div className="space-y-3 rounded-md border border-edge bg-graphite/40 px-4 py-4">
				<header className="flex items-center justify-between gap-3">
					<div className="flex items-center gap-3">
						<LaunchTaskStatusBadge status={task.status} />
						<span className="font-data text-[11px] text-dim">
							updated {fmtRelativeTime(task.updated_at)}
						</span>
					</div>
					{isTerminal ? null : (
						<LaunchTaskCancelButton linearIssueId={task.linear_issue_id} taskId={task.id} />
					)}
				</header>
				<p className="text-[12px] text-silver">
					{summary ?? <span className="text-dim italic">No summary yet.</span>}
				</p>
				<ol className="space-y-2">
					{steps.map((step) => (
						<LaunchStepRow
							key={step.id}
							step={step}
							isCurrent={step.id === task.current_step_id}
						/>
					))}
				</ol>
			</div>
		</LaunchTaskShell>
	)
}
