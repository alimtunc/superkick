import { useCallback, useMemo, useState } from 'react'

import { IssueFilterBar } from '@/components/issues/IssueFilterBar'
import type { FilterOptionSet } from '@/components/issues/IssueFilterDropdown'
import { IssueKeyboard } from '@/components/issues/IssueKeyboard'
import { IssuesKanbanView } from '@/components/issues/IssuesKanbanView'
import { IssuesListView } from '@/components/issues/IssuesListView'
import { IssueViewTabs } from '@/components/issues/IssueViewTabs'
import { Pill } from '@/components/ui/pill'
import { EmptyState } from '@/components/ui/state-empty'
import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
import { useIssues } from '@/hooks/useIssues'
import { useIssuesView } from '@/hooks/useIssuesView'
import { useViewer } from '@/hooks/useViewer'
import { EMPTY_FILTERS, parseIssuesSearch, resolveSearch } from '@/lib/issues/searchParams'
import { issuesQuery, launchQueueQuery } from '@/lib/queries'
import { usePageActions } from '@/shell/usePageActions'
import type {
	IssueFilterState,
	IssueGroupBy,
	IssueSort,
	IssueViewLayout,
	IssueViewTab,
	IssueWithState,
	LinearIssueListItem
} from '@/types'
import { createRoute, useNavigate } from '@tanstack/react-router'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/issues',
	validateSearch: parseIssuesSearch,
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(issuesQuery()),
			context.queryClient.ensureQueryData(launchQueueQuery())
		]),
	component: IssuesPage
})

function IssuesPage() {
	const rawSearch = Route.useSearch()
	const navigate = useNavigate({ from: Route.fullPath })
	const { viewerId } = useViewer()
	const resolved = useMemo(() => resolveSearch(rawSearch, viewerId), [rawSearch, viewerId])

	const data = useIssues()
	const view = useIssuesView({
		issues: data.issues,
		viewerId,
		tab: resolved.tab,
		filters: resolved.filters,
		sort: resolved.sort,
		group: resolved.group,
		showDone: resolved.showDone
	})

	const options = useMemo<FilterOptionSet>(() => buildFilterOptions(data.issues), [data.issues])

	const [dropdownOpen, setDropdownOpen] = useState(false)
	const [focused, setFocused] = useState<string | null>(null)

	const visibleIdentifiers = useMemo(
		() => view.groups.flatMap((g) => g.issues.map((w) => w.issue.identifier)),
		[view.groups]
	)

	const onTabChange = useCallback(
		(next: IssueViewTab) => {
			navigate({
				search: (prev) => ({ ...prev, tab: next === 'mine' ? undefined : next })
			})
		},
		[navigate]
	)

	const onSortChange = useCallback(
		(next: IssueSort) => {
			navigate({ search: (prev) => ({ ...prev, sort: next === 'updated' ? undefined : next }) })
		},
		[navigate]
	)

	const onGroupChange = useCallback(
		(next: IssueGroupBy) => {
			navigate({ search: (prev) => ({ ...prev, group: next === 'lifecycle' ? undefined : next }) })
		},
		[navigate]
	)

	const onLayoutChange = useCallback(
		(next: IssueViewLayout) => {
			navigate({ search: (prev) => ({ ...prev, view: next === 'list' ? undefined : next }) })
		},
		[navigate]
	)

	const onFiltersChange = useCallback(
		(next: IssueFilterState) => {
			navigate({ search: (prev) => ({ ...prev, ...serializeFilters(next) }) })
		},
		[navigate]
	)

	const onToggleDone = useCallback(() => {
		navigate({
			search: (prev) => ({ ...prev, showDone: resolved.showDone ? undefined : true })
		})
	}, [navigate, resolved.showDone])

	const isInitialLoading = data.loading && data.issues.length === 0

	usePageActions({
		sub: useMemo(
			() => (
				<Pill tone="neutral" mono size="xs">
					{view.total} open
				</Pill>
			),
			[view.total]
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
					<IssueViewTabs tab={resolved.tab} counts={view.tabCounts} onChange={onTabChange} />
					<IssueFilterBar
						filters={resolved.filters}
						sort={resolved.sort}
						group={resolved.group}
						layout={resolved.view}
						options={options}
						onFiltersChange={onFiltersChange}
						onSortChange={onSortChange}
						onGroupChange={onGroupChange}
						onLayoutChange={onLayoutChange}
						dropdownOpen={dropdownOpen}
						onDropdownOpenChange={setDropdownOpen}
					/>

					{resolved.view === 'board' ? (
						<IssuesKanbanView
							queueItems={data.queueItems}
							activeCapacity={data.activeCapacity}
							generatedAt={data.generatedAt}
							recentUnblocks={data.recentUnblocks}
						/>
					) : (
						<IssuesListView
							tab={resolved.tab}
							groups={view.groups}
							bucketByIdentifier={view.bucketByIdentifier}
							doneCountThisWeek={view.doneCountThisWeek}
							showDone={resolved.showDone}
							onToggleDone={onToggleDone}
							focusedIdentifier={focused}
						/>
					)}

					<IssueKeyboard
						identifiers={visibleIdentifiers}
						focusedIdentifier={focused}
						onFocus={setFocused}
						onOpenFilter={() => setDropdownOpen(true)}
					/>
				</>
			) : null}
		</div>
	)
}

function buildFilterOptions(issues: readonly IssueWithState[]): FilterOptionSet {
	const assignees = new Map<string, string>()
	const statuses = new Map<string, string>()
	const priorities = new Map<number, string>()
	const labels = new Map<string, string>()
	const projects = new Set<string>()

	for (const wrapper of issues) {
		const issue: LinearIssueListItem = wrapper.issue
		if (issue.assignee) assignees.set(issue.assignee.id, issue.assignee.name)
		statuses.set(issue.status.state_type, issue.status.name)
		priorities.set(issue.priority.value, issue.priority.label)
		for (const label of issue.labels) labels.set(label.name, label.color)
		if (issue.project) projects.add(issue.project.name)
	}

	return {
		assignees: [...assignees.entries()].map(([id, name]) => ({ id, name })),
		statuses: [...statuses.entries()].map(([state_type, name]) => ({ state_type, name })),
		priorities: [...priorities.entries()].map(([value, label]) => ({ value, label })),
		labels: [...labels.entries()].map(([name, color]) => ({ name, color })),
		projects: [...projects]
	}
}

function serializeFilters(filters: IssueFilterState) {
	return {
		assignee: nonEmpty(filters.assignee),
		status: nonEmpty(filters.status),
		status_not: nonEmpty(filters.status_not),
		priority: nonEmpty(filters.priority),
		label: nonEmpty(filters.label),
		label_not: nonEmpty(filters.label_not),
		project: nonEmpty(filters.project)
	}
}

function nonEmpty<T>(values: T[]): T[] | undefined {
	return values.length === 0 ? undefined : values
}

// Suppress unused warning when filter state is empty.
void EMPTY_FILTERS
