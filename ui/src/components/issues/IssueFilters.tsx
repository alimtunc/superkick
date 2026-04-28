import { V1_STATE_ORDER, v1IssueStateAccent } from '@/lib/domain'
import type { V1IssueState, V1StateFilter } from '@/types'

interface IssueFiltersProps {
	activeV1State: V1StateFilter
	counts: Record<V1IssueState, number>
	totalCount: number
	onSelect: (state: V1StateFilter) => void
}

export function IssueFilters({ activeV1State, counts, totalCount, onSelect }: IssueFiltersProps) {
	const isAllActive = activeV1State === 'all'

	return (
		<div className="flex flex-wrap gap-1.5">
			<button
				type="button"
				onClick={() => onSelect('all')}
				className={`font-data flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
					isAllActive ? 'bg-white/10 text-silver' : 'text-dim hover:bg-white/5 hover:text-fog'
				}`}
			>
				All
				<span className="text-dim">{totalCount}</span>
			</button>
			{V1_STATE_ORDER.map((state) => {
				const accent = v1IssueStateAccent[state]
				const count = counts[state]
				const isActive = state === activeV1State

				return (
					<button
						key={state}
						type="button"
						onClick={() => onSelect(state)}
						className={`font-data flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
							isActive ? 'bg-white/10 text-silver' : 'text-dim hover:bg-white/5 hover:text-fog'
						}`}
					>
						<span
							className={`inline-block h-2 w-2 rounded-full ${accent.dot}`}
							style={{ opacity: isActive ? 1 : 0.5 }}
						/>
						{accent.label}
						<span className="text-dim">{count}</span>
					</button>
				)
			})}
		</div>
	)
}
