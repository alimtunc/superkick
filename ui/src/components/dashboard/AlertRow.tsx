import { RunStateBadge } from '@/components/RunStateBadge'
import { Button } from '@/components/ui/button'
import { fmtElapsed, watchButtonClass } from '@/lib/domain'
import { useWatchedSessionsStore } from '@/stores/watchedSessions'
import type { Run } from '@/types'
import { Link } from '@tanstack/react-router'

interface AlertRowProps {
	run: Run
	refTime: number
	reason: string
	isLast: boolean
}

export function AlertRow({ run, refTime, reason, isLast }: AlertRowProps) {
	const borderClass = isLast ? '' : 'border-b border-edge/50'
	const isBlocked = run.state === 'waiting_human' || run.state === 'failed'
	const { isWatched, toggleWatch, maxReached } = useWatchedSessionsStore()
	const watched = isWatched(run.id)

	return (
		<div
			className={`flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-oxide-dim/40 ${borderClass} group`}
		>
			<span className={`status-bar h-6 ${isBlocked ? 'live-pulse bg-oxide' : 'bg-gold'}`} />
			<Link
				to="/runs/$runId"
				params={{ runId: run.id }}
				className="flex min-w-0 flex-1 items-center gap-3"
			>
				<span className="font-data w-20 shrink-0 text-[12px] font-medium text-fog transition-colors group-hover:text-oxide">
					{run.issue_identifier}
				</span>
				<span className="font-data hidden w-24 truncate text-[11px] text-dim sm:block">
					{run.repo_slug}
				</span>
				<RunStateBadge state={run.state} />
				<span className="font-data hidden text-[11px] text-dim md:block">
					{run.current_step_key ?? '--'}
				</span>
				<span className="ml-auto hidden text-[11px] text-ash md:block">{reason}</span>
				<span className="font-data shrink-0 text-[11px] text-dim">
					{fmtElapsed(run.started_at, refTime)}
				</span>
			</Link>
			<Button
				variant="ghost"
				size="icon-xs"
				onClick={() => toggleWatch(run.id)}
				disabled={!watched && maxReached}
				className={`font-data shrink-0 text-[10px] ${watchButtonClass(watched, maxReached)}`}
				title={watched ? 'Unwatch' : 'Watch'}
			>
				{watched ? '\u25C9' : '\u25CB'}
			</Button>
		</div>
	)
}
