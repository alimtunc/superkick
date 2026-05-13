import { ISSUE_STATE_ORDER, issueStateAccent, issueStateTone } from '@/lib/domain'
import { cn } from '@/lib/utils'
import type { IssueState, IssueStateFilter } from '@/types'
import { Dot } from '@/ui/Dot'

interface IssueFiltersProps {
	activeIssueState: IssueStateFilter
	counts: Record<IssueState, number>
	totalCount: number
	onSelect: (state: IssueStateFilter) => void
}

const filterButtonClass = (active: boolean): string =>
	cn(
		'flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 font-mono text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
		active
			? 'border-border-strong bg-raised text-fg'
			: 'border-transparent text-fg-muted hover:bg-raised hover:text-fg'
	)

export function IssueFilters({ activeIssueState, counts, totalCount, onSelect }: IssueFiltersProps) {
	const isAllActive = activeIssueState === 'all'

	return (
		<div className="flex flex-wrap gap-1.5">
			<button type="button" onClick={() => onSelect('all')} className={filterButtonClass(isAllActive)}>
				All
				<span className="text-fg-dim">{totalCount}</span>
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
						<Dot tone={issueStateTone[state]} size={6} />
						{accent.label}
						<span className="text-fg-dim">{count}</span>
					</button>
				)
			})}
		</div>
	)
}
