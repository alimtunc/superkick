import { useIssueLaunchTasks } from '@/hooks/useIssueLaunchTasks'
import { fmtRelativeTime } from '@/lib/domain'
import type { LaunchTask, LaunchTaskStep } from '@/types'

import { LaunchStepRow } from './LaunchStepRow'
import { LaunchTaskEmptyState } from './LaunchTaskEmptyState'
import { LaunchTaskNeedsHumanCallout } from './LaunchTaskNeedsHumanCallout'
import { LaunchTaskShell } from './LaunchTaskShell'
import { LaunchTaskStatusBadge } from './LaunchTaskStatusBadge'

interface LaunchTaskFeedProps {
	issueIdentifier: string
}

interface BlockingContext {
	step: LaunchTaskStep | null
	headline: string
	hint: string
}

function findBlockingContext(task: LaunchTask, steps: LaunchTaskStep[]): BlockingContext | null {
	const stepNeedsHuman = steps.find((s) => s.status === 'needs_human') ?? null
	if (stepNeedsHuman) {
		return {
			step: stepNeedsHuman,
			headline: 'Step waiting on you',
			hint: stepNeedsHuman.summary?.trim() || 'Open the linked run or chat to unblock the agent.'
		}
	}
	if (task.status === 'needs_human') {
		const current = task.current_step_id
			? (steps.find((s) => s.id === task.current_step_id) ?? null)
			: null
		return {
			step: current,
			headline: 'Launch task waiting on you',
			hint: task.summary?.trim() || 'Reply in the chat to keep the task moving.'
		}
	}
	return null
}

export function LaunchTaskFeed({ issueIdentifier }: LaunchTaskFeedProps) {
	const { view, loading, error } = useIssueLaunchTasks(issueIdentifier)

	if (loading && !view) {
		return (
			<LaunchTaskShell>
				<div className="rounded-md border border-edge bg-graphite/40 px-4 py-3">
					<p className="font-data text-[11px] text-dim">Loading…</p>
				</div>
			</LaunchTaskShell>
		)
	}

	if (error && !view) {
		return (
			<LaunchTaskShell>
				<div className="rounded-md border border-oxide/30 bg-oxide-dim px-4 py-3">
					<p className="font-data text-[11px] text-oxide">Failed to load launch task: {error}</p>
				</div>
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

	return (
		<LaunchTaskShell>
			{blocking ? (
				<LaunchTaskNeedsHumanCallout
					headline={blocking.headline}
					hint={blocking.hint}
					blockingStep={blocking.step}
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
