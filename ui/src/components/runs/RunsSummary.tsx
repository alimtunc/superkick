import { CounterCell } from '@/components/runs/CounterCell'

export function RunsSummary({
	total,
	active,
	completed,
	failed,
	needsAttention
}: {
	total: number
	active: number
	completed: number
	failed: number
	needsAttention: number
}) {
	if (total === 0) return null

	return (
		<div className="grid grid-cols-5 gap-3">
			<CounterCell label="TOTAL" value={total} />
			<CounterCell label="ACTIVE" value={active} accent="text-cyan" />
			<CounterCell label="COMPLETED" value={completed} accent="text-mineral" />
			<CounterCell label="FAILED" value={failed} accent={failed > 0 ? 'text-oxide' : undefined} />
			<CounterCell
				label="ATTENTION"
				value={needsAttention}
				accent={needsAttention > 0 ? 'text-gold' : undefined}
			/>
		</div>
	)
}
