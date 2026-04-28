import { useMemo } from 'react'

import { IssuesHeader } from '@/components/issues/IssuesHeader'
import { IssuesToolbar } from '@/components/issues/IssuesToolbar'
import { IssuesViewToggle } from '@/components/issues/IssuesViewToggle'
import { buildLabelColorMap } from '@/components/issues/LabelFilter'
import { V1IssueKanbanView } from '@/components/issues/V1IssueKanbanView'
import { V1IssueListView } from '@/components/issues/V1IssueListView'
import { useFilteredIssues } from '@/hooks/useFilteredIssues'
import { useIssueAggregations } from '@/hooks/useIssueAggregations'
import { useIssueFilters } from '@/hooks/useIssueFilters'
import { useV1Issues } from '@/hooks/useV1Issues'
import { issuesQuery, launchQueueQuery } from '@/lib/queries'
import { createRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'

import { Route as shellRoute } from './route'

const searchSchema = z.object({
	view: z.enum(['list', 'kanban']).optional()
})

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/issues',
	validateSearch: (raw): { view?: 'list' | 'kanban' } => searchSchema.parse(raw),
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(issuesQuery()),
			context.queryClient.ensureQueryData(launchQueueQuery())
		]),
	component: IssuesPage
})

function IssuesPage() {
	const search = Route.useSearch()
	const navigate = useNavigate({ from: Route.fullPath })
	const view = search.view ?? 'list'

	const data = useV1Issues()
	const filters = useIssueFilters()
	const aggregations = useIssueAggregations(data.allIssues)
	const labelColors = useMemo(() => buildLabelColorMap(data.allIssues), [data.allIssues])

	const { counts, filteredIssues, grouped, filteredQueueItems } = useFilteredIssues({
		allIssues: data.issues,
		queueItems: data.queueItems,
		filters
	})

	const isInitialLoading = data.loading && data.issues.length === 0

	return (
		<div>
			<IssuesHeader
				totalCount={data.totalCount}
				loading={data.loading}
				lastRefresh={data.lastRefresh}
				onRefresh={data.refresh}
			/>

			<div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8">
				<div className="flex items-center justify-between">
					<h1 className="font-data text-[12px] tracking-wider text-fog uppercase">Issues</h1>
					<IssuesViewToggle
						value={view}
						onChange={(next) =>
							navigate({
								search: (prev) => ({ ...prev, view: next === 'list' ? undefined : next })
							})
						}
					/>
				</div>

				{data.error ? <p className="font-data text-[11px] text-oxide">{data.error}</p> : null}

				{isInitialLoading ? (
					<p className="font-data py-10 text-center text-dim">Loading issues...</p>
				) : null}

				{!data.loading && data.issues.length === 0 ? (
					<p className="font-data py-10 text-center text-dim">No issues found.</p>
				) : null}

				{data.issues.length > 0 ? (
					<>
						<IssuesToolbar
							stateFilter={{
								show: view === 'list',
								active: filters.activeV1State,
								counts,
								total: data.totalCount,
								onSelect: filters.setActiveV1State
							}}
							filters={filters}
							derivations={{
								allLabels: aggregations.allLabels,
								labelColors,
								labelCounts: aggregations.labelCounts,
								allProjects: aggregations.allProjects
							}}
						/>

						{view === 'kanban' ? (
							<V1IssueKanbanView
								queueItems={filteredQueueItems}
								activeCapacity={data.activeCapacity}
								generatedAt={data.generatedAt}
								recentUnblocks={data.recentUnblocks}
							/>
						) : (
							<V1IssueListView
								allIssues={data.issues}
								queueItems={data.queueItems}
								filteredIssues={filteredIssues}
								grouped={grouped}
								activeV1State={filters.activeV1State}
							/>
						)}
					</>
				) : null}
			</div>
		</div>
	)
}
