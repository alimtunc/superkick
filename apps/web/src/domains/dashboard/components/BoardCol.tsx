import { EmptyState } from '@/components/primitives'
import { BoardCard } from '@/domains/dashboard/components/BoardCard'
import type { Run } from '@/types'

interface BoardColProps {
	title: string
	count: number
	runs: Run[]
	refTime: number
	accent: string
}

const accentBorders: Record<string, string> = {
	cyan: 'border-t-info',
	gold: 'border-t-warn'
}

export function BoardCol({ title, count, runs, refTime, accent }: BoardColProps) {
	const border = accentBorders[accent] ?? 'border-t-fg-dim'

	return (
		<div className={`panel border-t-2 ${border} overflow-hidden`}>
			<div className="flex items-center justify-between border-b border-border px-3 py-2">
				<span className="font-data text-[10px] tracking-wider text-fg-dim uppercase">{title}</span>
				<span className="font-data text-[11px] text-fg-dim">{count}</span>
			</div>
			{runs.length === 0 ? (
				<div className="px-3 py-4">
					<EmptyState title="Empty" density="compact" />
				</div>
			) : (
				<div className="divide-y divide-border/50">
					{runs.map((run) => (
						<BoardCard key={run.id} run={run} refTime={refTime} />
					))}
				</div>
			)}
		</div>
	)
}
