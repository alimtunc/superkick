import { StalledBadge } from '@/components/dashboard/queue/StalledBadge'
import { ExecutionModeBadge } from '@/components/ExecutionModeBadge'
import { RunBadges } from '@/components/runs/RunBadges'
import { RunStateBadge } from '@/components/RunStateBadge'
import { fmtRunElapsed, pickRunReason, stepLabel } from '@/lib/domain'
import type { QueueRunSummary } from '@/types'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'

interface RunCardProps {
	run: QueueRunSummary
	refTime: number
	/**
	 * Layout variant. `respond` flips the primary CTA to the run detail
	 * (where the attention / interrupt panels live) and demotes the issue
	 * link to the secondary slot — used by the Needs Human column.
	 */
	variant: 'default' | 'respond'
}

/**
 * Kanban-style compact card. The card body is a single `<Link>` to the
 * primary destination; a sibling pill-link in the footer covers the secondary
 * destination so we never nest two interactive elements.
 */
export function RunCard({ run, refTime, variant }: RunCardProps) {
	const step = run.current_step_key ? (stepLabel[run.current_step_key] ?? run.current_step_key) : null
	const reason = pickRunReason(run)
	const elapsed = fmtRunElapsed(run, refTime)

	const primary =
		variant === 'respond'
			? {
					to: '/runs/$runId' as const,
					params: { runId: run.id },
					label: `Respond to ${run.issue_identifier}`
				}
			: {
					to: '/issues/$issueId' as const,
					params: { issueId: run.issue_id },
					label: `Open ${run.issue_identifier}`
				}

	const secondary =
		variant === 'respond'
			? { to: '/issues/$issueId' as const, params: { issueId: run.issue_id }, label: 'Issue' }
			: { to: '/runs/$runId' as const, params: { runId: run.id }, label: 'Detail' }

	return (
		<div className="panel group flex flex-col gap-1.5 p-2.5 transition-colors hover:border-edge-bright">
			<Link
				to={primary.to}
				params={primary.params}
				aria-label={primary.label}
				className="flex flex-col gap-1.5"
			>
				<div className="flex items-center gap-2">
					<RunStateBadge state={run.state} />
					<span className="font-data truncate text-[12px] font-medium text-fog transition-colors group-hover:text-neon-green">
						{run.issue_identifier}
					</span>
					<span className="ml-auto shrink-0">
						<RunBadges run={run} />
					</span>
				</div>

				<div className="flex items-center justify-between gap-2">
					<span className="font-data truncate text-[10px] text-ash">{step ?? '—'}</span>
					<span className="font-data shrink-0 text-[10px] text-dim">{elapsed}</span>
				</div>

				<div className="font-data truncate text-[10px] text-dim">
					{run.repo_slug}
					{run.branch_name ? ` → ${run.branch_name}` : null}
				</div>

				{reason ? <p className="font-data line-clamp-2 text-[10px] text-silver">{reason}</p> : null}

				{run.stalled_for_seconds != null && run.stalled_reason != null ? (
					<StalledBadge run={run} />
				) : null}

				{run.execution_mode ? (
					<div>
						<ExecutionModeBadge mode={run.execution_mode} />
					</div>
				) : null}
			</Link>

			<Link
				to={secondary.to}
				params={secondary.params}
				className="font-data inline-flex items-center gap-1 self-end rounded px-1.5 py-0.5 text-[10px] tracking-wider text-dim uppercase transition-colors hover:bg-slate-deep hover:text-silver"
				aria-label={`${secondary.label} for ${run.issue_identifier}`}
			>
				<span>{secondary.label}</span>
				<ArrowUpRight size={10} aria-hidden="true" />
			</Link>
		</div>
	)
}
