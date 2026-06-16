import { Pill } from '@/components/primitives'
import { prStateTone } from '@/lib/domain'
import type { PrState } from '@/types'

const label: Record<PrState, string> = {
	open: 'OPEN',
	draft: 'DRAFT',
	merged: 'MERGED',
	closed: 'CLOSED'
}

export function PrStateBadge({ state }: { state: PrState }) {
	return (
		<Pill tone={prStateTone[state]} size="xs">
			{label[state]}
		</Pill>
	)
}
