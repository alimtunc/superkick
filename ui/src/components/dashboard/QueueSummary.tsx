import { isUrgentQueue, queueAccent } from '@/lib/domain'
import type { OperatorQueue, QueueRunSummary } from '@/types'
import { OPERATOR_QUEUES } from '@/types'

interface QueueSummaryProps {
	groups: Record<OperatorQueue, QueueRunSummary[]>
	totals: Record<OperatorQueue, number>
	onJump: (queue: OperatorQueue) => void
}

export function QueueSummary({ groups, totals, onJump }: QueueSummaryProps) {
	return (
		<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
			{OPERATOR_QUEUES.map((queue) => {
				const accent = queueAccent[queue]
				const count = totals[queue]
				const sample = groups[queue][0]
				const urgent = isUrgentQueue(queue, count)
				const ariaLabel = `Jump to ${accent.label}, ${count} ${count === 1 ? 'run' : 'runs'}`
				return (
					<button
						key={queue}
						type="button"
						onClick={() => onJump(queue)}
						aria-label={ariaLabel}
						className={`panel p-4 text-left transition-colors hover:border-edge-bright ${
							urgent ? 'glow-red' : ''
						}`}
					>
						<p className={`font-data text-[10px] tracking-wider uppercase ${accent.text}`}>
							<span aria-hidden="true">{accent.icon}</span> {accent.label}
						</p>
						<p className={`font-data mt-2 text-2xl leading-none font-medium ${accent.text}`}>
							{count}
						</p>
						<p className="font-data mt-2 truncate text-[10px] text-dim">
							{sample ? `Latest: ${sample.issue_identifier}` : 'No runs'}
						</p>
					</button>
				)
			})}
		</div>
	)
}
