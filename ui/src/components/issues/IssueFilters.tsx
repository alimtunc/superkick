import { ISSUE_STATE_ORDER, issueStateAccent } from '@/lib/domain'
import type { IssueState, IssueStateFilter } from '@/types'

interface IssueFiltersProps {
	activeIssueState: IssueStateFilter
	counts: Record<IssueState, number>
	totalCount: number
	onSelect: (state: IssueStateFilter) => void
}

export function IssueFilters({ activeIssueState, counts, totalCount, onSelect }: IssueFiltersProps) {
	const isAllActive = activeIssueState === 'all'

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
			{ISSUE_STATE_ORDER.map((state) => {
				const accent = issueStateAccent[state]
				const count = counts[state]
				const isActive = state === activeIssueState

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
