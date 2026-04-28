import { Pill } from '@/components/ui/pill'
import { stateTone } from '@/lib/domain'
import type { RunState } from '@/types'

export function RunStateBadge({ state }: { state: RunState }) {
	return (
		<Pill tone={stateTone[state]} size="xs">
			{state.replace(/_/g, ' ')}
		</Pill>
	)
}
