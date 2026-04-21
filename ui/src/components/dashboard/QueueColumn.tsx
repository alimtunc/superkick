import { QueueCard } from '@/components/dashboard/QueueCard'
import { queueAccent } from '@/lib/domain'
import type { OperatorQueue, QueueRunSummary } from '@/types'

interface QueueColumnProps {
	queue: OperatorQueue
	runs: QueueRunSummary[]
	refTime: number
}

export function QueueColumn({ queue, runs, refTime }: QueueColumnProps) {
	const accent = queueAccent[queue]
	return (
		<div className={`panel overflow-hidden border-t-2 ${accent.border}`}>
			<div className="flex items-start justify-between gap-2 border-b border-edge px-3 py-2">
				<div className="min-w-0">
					<p className={`font-data text-[10px] tracking-wider uppercase ${accent.text}`}>
						<span aria-hidden="true">{accent.icon}</span> {accent.label}
					</p>
					<p className="font-data mt-0.5 truncate text-[10px] text-dim">{accent.description}</p>
				</div>
				<span className="font-data shrink-0 text-[11px] text-ash">{runs.length}</span>
			</div>
			{runs.length === 0 ? (
				<p className="font-data px-3 py-4 text-[11px] text-dim">Empty</p>
			) : (
				<div className="divide-y divide-edge/50">
					{runs.map((run) => (
						<QueueCard key={run.id} run={run} refTime={refTime} />
					))}
				</div>
			)}
		</div>
	)
}
