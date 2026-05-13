import { useCallback, useMemo } from 'react'

import { IssuesKanbanView } from '@/components/issues/IssuesKanbanView'
import { IssuesListView } from '@/components/issues/IssuesListView'
import { IssuesPageActions } from '@/components/issues/IssuesPageActions'
import { IssuesToolbar } from '@/components/issues/IssuesToolbar'
import { Pill } from '@/components/ui/pill'
import { EmptyState } from '@/components/ui/state-empty'
import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
import { useFilteredIssues } from '@/hooks/useFilteredIssues'
import { useIssueAggregations } from '@/hooks/useIssueAggregations'
import { useIssueFilters } from '@/hooks/useIssueFilters'
import { useIssues } from '@/hooks/useIssues'
import { buildLabelColorMap } from '@/lib/issueLabels'
import { issuesQuery, launchQueueQuery } from '@/lib/queries'
import { usePageActions } from '@/shell/usePageActions'
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

	const data = useIssues()
	const filters = useIssueFilters()
	const aggregations = useIssueAggregations(data.allIssues)
	const labelColors = useMemo(() => buildLabelColorMap(data.allIssues), [data.allIssues])

	const { counts, filteredIssues, grouped, filteredQueueItems } = useFilteredIssues({
		allIssues: data.issues,
		queueItems: data.queueItems,
		filters
	})

	const isInitialLoading = data.loading && data.issues.length === 0

	const onViewChange = useCallback(
		(next: 'list' | 'kanban'): void => {
			navigate({
				search: (prev) => ({ ...prev, view: next === 'list' ? undefined : next })
			})
		},
		[navigate]
	)

	usePageActions({
		sub: useMemo(
			() => (
				<Pill tone="neutral" mono size="xs">
					{data.totalCount} open
				</Pill>
			),
			[data.totalCount]
		),
		right: useMemo(
			() => (
				<IssuesPageActions
					view={view}
					onViewChange={onViewChange}
					filters={filters}
					derivations={{
						allLabels: aggregations.allLabels,
						labelColors,
						labelCounts: aggregations.labelCounts,
						allProjects: aggregations.allProjects
					}}
				/>
			),
			[
				view,
				onViewChange,
				filters,
				aggregations.allLabels,
				aggregations.labelCounts,
				aggregations.allProjects,
				labelColors
			]
		)
	})

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{data.error ? (
				<div className="px-6 py-4">
					<ErrorState message={data.error} onRetry={data.refresh} density="compact" />
				</div>
			) : null}

			{isInitialLoading ? (
				<div className="px-6 py-4">
					<LoadingState rows={5} />
				</div>
			) : null}

			{!data.loading && data.issues.length === 0 ? (
				<div className="px-6 py-4">
					<EmptyState title="No issues found." />
				</div>
			) : null}

			{data.issues.length > 0 ? (
				<>
					<IssuesToolbar
						stateFilter={{
							show: view === 'list',
							active: filters.activeIssueState,
							counts,
							total: data.totalCount,
							onSelect: filters.setActiveIssueState
						}}
						filters={filters}
						labelColors={labelColors}
					/>

					{view === 'kanban' ? (
						<IssuesKanbanView
							queueItems={filteredQueueItems}
							activeCapacity={data.activeCapacity}
							generatedAt={data.generatedAt}
							recentUnblocks={data.recentUnblocks}
						/>
					) : (
						<IssuesListView
							allIssues={data.issues}
							queueItems={data.queueItems}
							filteredIssues={filteredIssues}
							grouped={grouped}
							activeIssueState={filters.activeIssueState}
						/>
					)}
				</>
			) : null}
		</div>
	)
}
