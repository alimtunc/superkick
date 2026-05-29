import { Pill, type PillTone } from '@/components/ui/pill'
import type { PrState } from '@/types'

const tone: Record<PrState, PillTone> = {
	open: 'success',
	draft: 'neutral',
	merged: 'accent',
	closed: 'danger'
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
