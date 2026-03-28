import { stateBadgeStyle } from '@/lib/domain'
import type { RunState } from '@/types'

export function RunStateBadge({ state }: { state: RunState }) {
	return (
		<span
			className={`font-data inline-block rounded px-2 py-0.5 text-[10px] font-medium ${stateBadgeStyle[state]}`}
		>
			{state.replace(/_/g, ' ')}
		</span>
	)
}
