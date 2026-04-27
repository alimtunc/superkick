import { Badge } from '@/components/dashboard/Badge'
import { StalledBadge } from '@/components/dashboard/queue/StalledBadge'
import { Button } from '@/components/ui/button'
import { fmtElapsed, stepLabel, watchButtonClass, watchButtonTitle } from '@/lib/domain'
import { useWatchedSessionsStore } from '@/stores/watchedSessions'
import type { QueueRunSummary } from '@/types'
import { Link } from '@tanstack/react-router'

interface QueueCardProps {
	run: QueueRunSummary
	refTime: number
}

export function QueueCard({ run, refTime }: QueueCardProps) {
	const { isWatched, toggleWatch, maxReached } = useWatchedSessionsStore()
	const watched = isWatched(run.id)
	const reason = run.reason
	const watchLabel = watched ? 'Unwatch' : 'Watch'

	return (
		<div className="group flex items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-slate-deep/50">
			<Link to="/runs/$runId" params={{ runId: run.id }} className="min-w-0 flex-1">
				<div className="flex items-center justify-between gap-2">
					<span className="font-data text-[12px] font-medium text-fog transition-colors group-hover:text-neon-green">
						{run.issue_identifier}
					</span>
					<QueueCardBadges run={run} />
				</div>
				<div className="mt-0.5 flex items-center gap-2">
					<span className="font-data truncate text-[10px] text-dim">{run.repo_slug}</span>
					{run.current_step_key ? (
						<span className="font-data text-[10px] text-ash">
							{stepLabel[run.current_step_key] ?? run.current_step_key}
						</span>
					) : null}
				</div>
				{reason ? <p className="font-data mt-1 truncate text-[10px] text-silver">{reason}</p> : null}
				{run.stalled_for_seconds != null && run.stalled_reason != null ? (
					<div className="mt-1">
						<StalledBadge run={run} />
					</div>
				) : null}
				<div className="mt-1 flex items-center justify-between">
					<span className="font-data text-[10px] text-dim">
						{fmtElapsed(run.started_at, refTime)}
					</span>
					{run.branch_name ? (
						<span className="font-data max-w-28 truncate text-[10px] text-dim">
							{run.branch_name}
						</span>
					) : null}
				</div>
			</Link>
			<Button
				variant="ghost"
				size="icon-xs"
				onClick={() => toggleWatch(run.id)}
				disabled={!watched && maxReached}
				className={`font-data mt-1 shrink-0 text-[10px] ${watchButtonClass(watched, maxReached)}`}
				title={watchButtonTitle(watched, maxReached)}
				aria-label={watchLabel}
				aria-pressed={watched}
			>
				<span aria-hidden="true">{watched ? '◉' : '○'}</span>
			</Button>
		</div>
	)
}

function QueueCardBadges({ run }: { run: QueueRunSummary }) {
	return (
		<div className="flex items-center gap-1">
			{run.pending_attention_count > 0 ? (
				<Badge tone="oxide" label={`${run.pending_attention_count}!`} title="Pending attention" />
			) : null}
			{run.pending_interrupt_count > 0 ? (
				<Badge tone="gold" label={`${run.pending_interrupt_count}?`} title="Pending interrupts" />
			) : null}
			{run.pr ? <Badge tone="violet" label={`#${run.pr.number}`} title={`PR ${run.pr.state}`} /> : null}
		</div>
	)
}
