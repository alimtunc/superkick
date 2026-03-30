import { BoardCard } from '@/components/dashboard/BoardCard'
import type { Run } from '@/types'

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
