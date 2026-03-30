import { PendingInterrupt } from '@/components/run-detail/PendingInterrupt'
import { ResolvedInterrupt } from '@/components/run-detail/ResolvedInterrupt'
import type { Interrupt } from '@/types'

interface InterruptPanelProps {
	runId: string
	interrupts: Interrupt[]
	onAnswered: () => void
}

export function InterruptPanel({ runId, interrupts, onAnswered }: InterruptPanelProps) {
	const pending = interrupts.filter((i) => i.status === 'pending')
	const resolved = interrupts.filter((i) => i.status !== 'pending')

	return (
		<div className="space-y-3">
			{pending.map((interrupt) => (
				<PendingInterrupt
					key={interrupt.id}
					runId={runId}
					interrupt={interrupt}
					onAnswered={onAnswered}
				/>
			))}

			{resolved.length > 0 ? (
				<div className="space-y-2">
					<h3 className="font-data text-[10px] tracking-wider text-dim uppercase">History</h3>
					{resolved.map((interrupt) => (
						<ResolvedInterrupt key={interrupt.id} interrupt={interrupt} />
					))}
				</div>
			) : null}

			{interrupts.length === 0 ? <p className="font-data text-sm text-dim">No interrupts.</p> : null}
		</div>
	)
}
