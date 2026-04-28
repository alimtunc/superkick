import { ActiveFiltersBar } from '@/components/issues/ActiveFiltersBar'
import { FilterDropdown } from '@/components/issues/FilterDropdown'
import { IssueFilters } from '@/components/issues/IssueFilters'
import { SearchBar } from '@/components/issues/SearchBar'
import { StatusBar } from '@/components/issues/StatusBar'
import type { IssueFiltersState } from '@/hooks/useIssueFilters'
import type { IssueState, IssueStateFilter } from '@/types'

export interface IssuesToolbarStateFilter {
	show: boolean
	active: IssueStateFilter
	counts: Record<IssueState, number>
	total: number
	onSelect: (next: IssueStateFilter) => void
}

export interface IssuesToolbarDerivations {
	allLabels: string[]
	labelColors: Map<string, string>
	labelCounts: Map<string, number>
	allProjects: string[]
}

interface IssuesToolbarProps {
	stateFilter: IssuesToolbarStateFilter
	filters: IssueFiltersState
	derivations: IssuesToolbarDerivations
}

/** Shared header strip for both the V1 list and kanban views. The status
 *  bar + search + dropdown + active-filters bar render identically across
 *  views; the V1 state pills only appear when `stateFilter.show` is true
 *  (list view) — the kanban columns are themselves the V1 state lanes,
 *  so a separate state filter would be redundant.
 *
 *  Props are grouped into three bundles to keep the call site readable:
 *  the toolbar's only own logic is deriving `hasActiveFilters` from the
 *  filter state — everything else is layout. */
export function IssuesToolbar({ stateFilter, filters, derivations }: IssuesToolbarProps) {
	const hasActiveFilters =
		filters.activeLabels.size > 0 || filters.activeProject !== null || filters.activePriorities.size > 0

	return (
		<div className="flex flex-col gap-4">
			<StatusBar counts={stateFilter.counts} total={stateFilter.total} />

			<div className="flex flex-wrap items-center gap-3">
				{stateFilter.show ? (
					<IssueFilters
						activeIssueState={stateFilter.active}
						counts={stateFilter.counts}
						totalCount={stateFilter.total}
						onSelect={stateFilter.onSelect}
					/>
				) : null}
				<div className="ml-auto">
					<FilterDropdown
						allLabels={derivations.allLabels}
						labelColors={derivations.labelColors}
						labelCounts={derivations.labelCounts}
						activeLabels={filters.activeLabels}
						onToggleLabel={filters.toggleLabel}
						allProjects={derivations.allProjects}
						activeProject={filters.activeProject}
						onSelectProject={filters.setActiveProject}
						activePriorities={filters.activePriorities}
						onTogglePriority={filters.togglePriority}
						hasActiveFilters={hasActiveFilters}
					/>
				</div>
			</div>

			<ActiveFiltersBar
				activeLabels={filters.activeLabels}
				labelColors={derivations.labelColors}
				onToggleLabel={filters.toggleLabel}
				activeProject={filters.activeProject}
				onClearProject={() => filters.setActiveProject(null)}
				activePriorities={filters.activePriorities}
				onTogglePriority={filters.togglePriority}
				onClearAll={filters.clearAllFilters}
			/>

			<SearchBar value={filters.search} onChange={filters.setSearch} />
		</div>
	)
}
