import { useMemo } from 'react'

import { SectionTitle } from '@/components/dashboard/SectionTitle'
import { ActiveFiltersBar } from '@/components/issues/ActiveFiltersBar'
import { FilterDropdown } from '@/components/issues/FilterDropdown'
import { IssueFilters } from '@/components/issues/IssueFilters'
import { IssueGroupCard } from '@/components/issues/IssueGroupCard'
import { IssueRow } from '@/components/issues/IssueRow'
import { IssuesHeader } from '@/components/issues/IssuesHeader'
import { buildLabelColorMap } from '@/components/issues/LabelFilter'
import { SearchBar } from '@/components/issues/SearchBar'
import { StatusBar } from '@/components/issues/StatusBar'
import { useIssues } from '@/hooks/useIssues'
import { BUCKET_META } from '@/lib/domain/classifyIssues'
import { issuesQuery } from '@/lib/queries'
import { createRoute } from '@tanstack/react-router'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/issues',
	loader: ({ context }) => context.queryClient.ensureQueryData(issuesQuery()),
	component: IssuesPage
})

function IssuesPage() {
	const {
		allIssues,
		filteredIssues,
		grouped,
		classified,
		activeBucket,
		setActiveBucket,
		search,
		setSearch,
		allLabels,
		labelCounts,
		activeLabels,
		toggleLabel,
		allProjects,
		activeProject,
		setActiveProject,
		activePriorities,
		togglePriority,
		clearAllFilters,
		totalCount,
		loading,
		error,
		lastRefresh,
		refresh
	} = useIssues()

	const bucketLabel = activeBucket === 'all' ? 'All' : BUCKET_META[activeBucket].label
	const labelColors = useMemo(() => buildLabelColorMap(allIssues), [allIssues])
	const hasActiveFilters = activeLabels.size > 0 || activeProject !== null || activePriorities.size > 0

	return (
		<div>
			<IssuesHeader
				totalCount={totalCount}
				loading={loading}
				lastRefresh={lastRefresh}
				onRefresh={refresh}
			/>

			<div className="mx-auto flex max-w-5xl flex-col gap-5 px-5 py-8">
				{error ? <p className="font-data text-[11px] text-oxide">{error}</p> : null}

				{loading && allIssues.length === 0 ? (
					<p className="font-data py-10 text-center text-dim">Loading issues...</p>
				) : null}

				{!loading && allIssues.length === 0 ? (
					<p className="font-data py-10 text-center text-dim">No issues found.</p>
				) : null}

				{allIssues.length > 0 ? (
					<>
						<StatusBar classified={classified} total={totalCount} />

						<div className="flex items-center">
							<IssueFilters
								activeBucket={activeBucket}
								classified={classified}
								totalCount={totalCount}
								onSelect={setActiveBucket}
							/>
							<div className="ml-auto">
								<FilterDropdown
									allLabels={allLabels}
									labelColors={labelColors}
									labelCounts={labelCounts}
									activeLabels={activeLabels}
									onToggleLabel={toggleLabel}
									allProjects={allProjects}
									activeProject={activeProject}
									onSelectProject={setActiveProject}
									activePriorities={activePriorities}
									onTogglePriority={togglePriority}
									hasActiveFilters={hasActiveFilters}
								/>
							</div>
						</div>

						<ActiveFiltersBar
							activeLabels={activeLabels}
							labelColors={labelColors}
							onToggleLabel={toggleLabel}
							activeProject={activeProject}
							onClearProject={() => setActiveProject(null)}
							activePriorities={activePriorities}
							onTogglePriority={togglePriority}
							onClearAll={clearAllFilters}
						/>

						<SearchBar value={search} onChange={setSearch} />

						<section>
							<SectionTitle title={bucketLabel} count={filteredIssues.length} />
							{filteredIssues.length > 0 ? (
								<div className="space-y-0.5">
									{grouped.groups.map((group) => (
										<IssueGroupCard key={group.parent.id} group={group} />
									))}
									{grouped.standalone.map((issue) => (
										<IssueRow key={issue.id} issue={issue} />
									))}
								</div>
							) : (
								<p className="font-data py-6 text-center text-[11px] text-dim">
									No {bucketLabel.toLowerCase()} issues.
								</p>
							)}
						</section>
					</>
				) : null}
			</div>
		</div>
	)
}
