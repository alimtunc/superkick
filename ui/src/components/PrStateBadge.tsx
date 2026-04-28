import { Pill, type PillTone } from '@/components/ui/pill'
import type { PrState } from '@/types'

const tone: Record<PrState, PillTone> = {
	open: 'live',
	draft: 'neutral',
	merged: 'violet',
	closed: 'oxide'
}

const label: Record<PrState, string> = {
	open: 'OPEN',
	draft: 'DRAFT',
	merged: 'MERGED',
	closed: 'CLOSED'
}

export function PrStateBadge({ state }: { state: PrState }) {
	return (
		<Pill tone={tone[state]} size="xs">
			{label[state]}
		</Pill>
	)
}
