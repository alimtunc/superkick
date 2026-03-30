import type { PrState } from '@/types'

const style: Record<PrState, string> = {
	open: 'border-neon-green/30 bg-neon-green/10 text-neon-green',
	draft: 'border-dim/30 bg-dim/10 text-dim',
	merged: 'border-violet-400/30 bg-violet-400/10 text-violet-400',
	closed: 'border-oxide/30 bg-oxide/10 text-oxide'
}

const label: Record<PrState, string> = {
	open: 'OPEN',
	draft: 'DRAFT',
	merged: 'MERGED',
	closed: 'CLOSED'
}

export function PrStateBadge({ state }: { state: PrState }) {
	return (
		<span
			className={`font-data inline-block rounded border px-1.5 py-0.5 text-[9px] leading-none font-medium uppercase ${style[state]}`}
		>
			{label[state]}
		</span>
	)
}
