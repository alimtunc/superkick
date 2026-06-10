import { Button } from '@/components/ui/button'
import {
	fmtElapsed,
	healthSignal,
	healthSignalBg,
	stepLabel,
	stateIcon,
	watchButtonClass,
	watchButtonTitle
} from '@/lib/domain'
import { useWatchedSessionsStore, selectMaxReached } from '@/stores/watchedSessions'
import type { Run } from '@/types'
import { Link } from '@tanstack/react-router'
import { Eye, EyeOff } from 'lucide-react'

export function BoardCard({ run, refTime }: { run: Run; refTime: number }) {
	const sig = healthSignal(run, refTime)
	const { isWatched, toggleWatch } = useWatchedSessionsStore()
	const maxReached = useWatchedSessionsStore(selectMaxReached)
	const watched = isWatched(run.id)

	return (
		<div className="group flex items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-raised/50">
			<span className={`status-bar mt-0.5 h-8 ${healthSignalBg[sig]}`} />
			<Link to="/runs/$runId" params={{ runId: run.id }} className="min-w-0 flex-1">
				<div className="flex items-center justify-between">
					<span className="font-data text-[12px] font-medium text-fg transition-colors group-hover:text-success">
						{run.issue_identifier}
					</span>
					<span className="font-data text-[10px] text-fg-dim">{stateIcon[run.state] ?? '--'}</span>
				</div>
				<div className="mt-0.5 flex items-center gap-2">
					<span className="font-data truncate text-[10px] text-fg-dim">{run.repo_slug}</span>
					{run.current_step_key ? (
						<span className="font-data text-[10px] text-fg-dim">
							{stepLabel[run.current_step_key] ?? run.current_step_key}
						</span>
					) : null}
				</div>
				<div className="mt-1 flex items-center justify-between">
					<span className="font-data text-[10px] text-fg-dim">
						{fmtElapsed(run.started_at, refTime)}
					</span>
					{run.branch_name ? (
						<span className="font-data max-w-28 truncate text-[10px] text-fg-dim">
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
			>
				{watched ? (
					<EyeOff size={12} strokeWidth={1.75} aria-hidden="true" />
				) : (
					<Eye size={12} strokeWidth={1.75} aria-hidden="true" />
				)}
			</Button>
		</div>
	)
}
