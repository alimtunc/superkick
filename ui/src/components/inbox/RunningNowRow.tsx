import { StalledBadge } from '@/components/dashboard/queue/StalledBadge'
import { RunStateBadge } from '@/components/RunStateBadge'
import { Pill } from '@/components/ui/pill'
import { fmtElapsed, stepLabel } from '@/lib/domain'
import type { QueueRunSummary } from '@/types'
import { Link } from '@tanstack/react-router'

interface RunningNowRowProps {
	run: QueueRunSummary
	refTime: number
}

/**
 * Single dense row for the Running Now section. Replaces the kanban-shaped
 * QueueCard which wastes vertical space in a full-width list. Step,
 * stalled annotation, and elapsed time stay on one line; reason / repo /
 * branch tuck into a tight second line that only renders when populated.
 */
export function RunningNowRow({ run, refTime }: RunningNowRowProps) {
	const step = run.current_step_key ? (stepLabel[run.current_step_key] ?? run.current_step_key) : null
	const showSecondLine = !!(run.reason || run.branch_name)

	return (
		<Link
			to="/runs/$runId"
			params={{ runId: run.id }}
			className="group flex flex-col gap-1 border-l-2 border-transparent px-3 py-2 transition-colors hover:border-l-edge-bright hover:bg-slate-deep/40 focus-visible:border-l-mineral focus-visible:bg-slate-deep/40 focus-visible:outline-none"
		>
			<div className="flex items-center gap-3">
				<RunStateBadge state={run.state} />
				<span className="font-data shrink-0 text-[12px] font-medium text-fog transition-colors group-hover:text-neon-green">
					{run.issue_identifier}
				</span>
				{step ? <span className="font-data shrink-0 text-[10px] text-ash">{step}</span> : null}
				{run.stalled_for_seconds != null && run.stalled_reason != null ? (
					<StalledBadge run={run} />
				) : null}
				<span className="ml-auto flex shrink-0 items-center gap-2">
					{run.pending_attention_count > 0 ? (
						<Pill tone="oxide" size="xs" title="Pending attention">
							{run.pending_attention_count} ATTN
						</Pill>
					) : null}
					{run.pending_interrupt_count > 0 ? (
						<Pill tone="gold" size="xs" title="Pending interrupts">
							{run.pending_interrupt_count} INTR
						</Pill>
					) : null}
					{run.pr ? (
						<Pill tone="violet" size="xs" title={`PR ${run.pr.state}`}>
							PR #{run.pr.number}
						</Pill>
					) : null}
					<span className="font-data text-[10px] text-ash">
						{fmtElapsed(run.started_at, refTime)}
					</span>
				</span>
			</div>
			{showSecondLine ? (
				<div className="flex items-center gap-3 pl-1">
					{run.reason ? (
						<span className="font-data flex-1 truncate text-[10px] text-silver">
							{run.reason}
						</span>
					) : null}
					{run.branch_name ? (
						<span className="font-data shrink-0 truncate text-[10px] text-ash">
							{run.branch_name}
						</span>
					) : null}
				</div>
			) : null}
		</Link>
	)
}
