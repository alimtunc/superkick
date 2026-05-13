import { FilterDropdown } from '@/components/issues/FilterDropdown'
import { IssuesViewToggle } from '@/components/issues/IssuesViewToggle'
import type { IssueFiltersState } from '@/hooks/useIssueFilters'
import { Btn } from '@/ui/Btn'

type IssuesViewMode = 'list' | 'kanban'

interface IssuesPageActionsDerivations {
	allLabels: string[]
	labelColors: Map<string, string>
	labelCounts: Map<string, number>
	allProjects: string[]
}

interface IssuesPageActionsProps {
	view: IssuesViewMode
	onViewChange: (next: IssuesViewMode) => void
	filters: IssueFiltersState
	derivations: IssuesPageActionsDerivations
}

export function IssuesPageActions({ view, onViewChange, filters, derivations }: IssuesPageActionsProps) {
	const hasActiveFilters =
		filters.activeLabels.size > 0 || filters.activeProject !== null || filters.activePriorities.size > 0

	return (
		<>
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
			<span aria-hidden="true" className="h-5 w-px bg-border" />
			<IssuesViewToggle value={view} onChange={onViewChange} />
			<Btn kind="primary" size="sm" icon="plus" disabled title="Coming soon">
				New issue
			</Btn>
		</>
	)
}
