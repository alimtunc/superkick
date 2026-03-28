import { Button } from '@/components/ui/button'
import {
	fmtElapsed,
	healthSignal,
	stepLabel,
	stateIcon,
	watchButtonClass,
	watchButtonTitle
} from '@/lib/domain'
import { useWatchedSessionsStore } from '@/stores/watchedSessions'
import type { Run } from '@/types'
import { Link } from '@tanstack/react-router'

interface BoardColProps {
	title: string
	count: number
	runs: Run[]
	refTime: number
	accent: string
}

const accentBorders: Record<string, string> = {
	cyan: 'border-t-cyan',
	gold: 'border-t-gold'
}

export function BoardCol({ title, count, runs, refTime, accent }: BoardColProps) {
	const border = accentBorders[accent] ?? 'border-t-dim'

	return (
		<div className={`panel border-t-2 ${border} overflow-hidden`}>
			<div className="flex items-center justify-between border-b border-edge px-3 py-2">
				<span className="font-data text-[10px] tracking-wider text-dim uppercase">{title}</span>
				<span className="font-data text-[11px] text-ash">{count}</span>
			</div>
			{runs.length === 0 ? (
				<p className="font-data px-3 py-4 text-[11px] text-dim">Empty</p>
			) : (
				<div className="divide-y divide-edge/50">
					{runs.map((run) => (
						<BoardCard key={run.id} run={run} refTime={refTime} />
					))}
				</div>
			)}
		</div>
	)
}

const healthBarColor = {
	critical: 'bg-oxide',
	warning: 'bg-gold',
	ok: 'bg-mineral'
} as const

function BoardCard({ run, refTime }: { run: Run; refTime: number }) {
	const sig = healthSignal(run, refTime)
	const { isWatched, toggleWatch, maxReached } = useWatchedSessionsStore()
	const watched = isWatched(run.id)

	return (
		<div className="group flex items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-slate-deep/50">
			<span className={`status-bar mt-0.5 h-8 ${healthBarColor[sig]}`} />
			<Link to="/runs/$runId" params={{ runId: run.id }} className="min-w-0 flex-1">
				<div className="flex items-center justify-between">
					<span className="font-data text-[12px] font-medium text-fog transition-colors group-hover:text-neon-green">
						{run.issue_identifier}
					</span>
					<span className="font-data text-[10px] text-dim">{stateIcon[run.state] ?? '--'}</span>
				</div>
				<div className="mt-0.5 flex items-center gap-2">
					<span className="font-data truncate text-[10px] text-dim">{run.repo_slug}</span>
					{run.current_step_key ? (
						<span className="font-data text-[10px] text-ash">
							{stepLabel[run.current_step_key] ?? run.current_step_key}
						</span>
					) : null}
				</div>
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
			>
				{watched ? '\u25C9' : '\u25CB'}
			</Button>
		</div>
	)
}
