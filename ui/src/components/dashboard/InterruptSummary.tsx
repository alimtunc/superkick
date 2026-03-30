import type { Interrupt } from '@/types'

export function InterruptSummary({ interrupts }: { interrupts: Interrupt[] }) {
	const pending = interrupts.filter((i) => i.status === 'pending')
	return (
		<div className="rounded border border-gold/20 bg-gold-dim p-2">
			<span className="font-data text-[10px] tracking-wider text-gold uppercase">
				{pending.length} pending interrupt{pending.length !== 1 ? 's' : ''}
			</span>
			{pending.slice(0, 2).map((int) => (
				<p key={int.id} className="font-data mt-1 truncate text-[11px] text-fog">
					{int.question}
				</p>
			))}
		</div>
	)
}
