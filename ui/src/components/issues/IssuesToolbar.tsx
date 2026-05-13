import { ActiveFiltersBar } from '@/components/issues/ActiveFiltersBar'
import { IssueFilters } from '@/components/issues/IssueFilters'
import { SearchBar } from '@/components/issues/SearchBar'
import { StatusBar } from '@/components/issues/StatusBar'
import type { IssueFiltersState } from '@/hooks/useIssueFilters'
import type { IssueState, IssueStateFilter } from '@/types'

interface IssuesToolbarStateFilter {
	show: boolean
	active: IssueStateFilter
	counts: Record<IssueState, number>
	total: number
	onSelect: (next: IssueStateFilter) => void
}

interface IssuesToolbarProps {
	stateFilter: IssuesToolbarStateFilter
	filters: IssueFiltersState
	labelColors: Map<string, string>
}

export function IssuesToolbar({ stateFilter, filters, labelColors }: IssuesToolbarProps) {
	return (
		<div className="flex flex-col gap-3 px-6 py-3">
			<div className="flex flex-wrap items-center gap-3">
				<div className="min-w-64 flex-1">
					<SearchBar value={filters.search} onChange={filters.setSearch} />
				</div>
				{stateFilter.show ? (
					<IssueFilters
						activeIssueState={stateFilter.active}
						counts={stateFilter.counts}
						totalCount={stateFilter.total}
						onSelect={stateFilter.onSelect}
					/>
				) : null}
			</div>

			<StatusBar counts={stateFilter.counts} total={stateFilter.total} />

			<ActiveFiltersBar
				activeLabels={filters.activeLabels}
				labelColors={labelColors}
				onToggleLabel={filters.toggleLabel}
				activeProject={filters.activeProject}
				onClearProject={() => filters.setActiveProject(null)}
				activePriorities={filters.activePriorities}
				onTogglePriority={filters.togglePriority}
				onClearAll={filters.clearAllFilters}
			/>
		</div>
	)
}
