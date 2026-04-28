import { ISSUE_STATE_ORDER, issueStateAccent } from '@/lib/domain'
import { cn } from '@/lib/utils'
import type { IssueState, IssueStateFilter } from '@/types'

interface IssueFiltersProps {
	activeIssueState: IssueStateFilter
	counts: Record<IssueState, number>
	totalCount: number
	onSelect: (state: IssueStateFilter) => void
}

const filterButtonClass = (active: boolean): string =>
	cn(
		'font-data flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-mineral/40 focus-visible:outline-none',
		active
			? 'border-edge-bright bg-slate-deep text-fog'
			: 'border-transparent text-ash hover:bg-slate-deep/50 hover:text-silver'
	)

export function IssueFilters({ activeIssueState, counts, totalCount, onSelect }: IssueFiltersProps) {
	const isAllActive = activeIssueState === 'all'

	return (
		<div className="flex flex-wrap gap-1.5">
			<button type="button" onClick={() => onSelect('all')} className={filterButtonClass(isAllActive)}>
				All
				<span className="text-ash">{totalCount}</span>
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
						className={filterButtonClass(isActive)}
					>
						<span
							className={`inline-block h-2 w-2 rounded-full ${accent.dot}`}
							style={{ opacity: isActive ? 1 : 0.5 }}
							aria-hidden="true"
						/>
						{accent.label}
						<span className="text-ash">{count}</span>
					</button>
				)
			})}
		</div>
	)
}
