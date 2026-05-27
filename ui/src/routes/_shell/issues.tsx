import { useCallback, useMemo, useState } from 'react'

import { IssueFilterBar } from '@/components/issues/IssueFilterBar'
import type { FilterOptionSet } from '@/components/issues/IssueFilterDropdown'
import { IssueKeyboard } from '@/components/issues/IssueKeyboard'
import { IssueRowSkeleton } from '@/components/issues/IssueRowSkeleton'
import { IssuesEmptyState } from '@/components/issues/IssuesEmptyState'
import { IssuesKanbanView } from '@/components/issues/IssuesKanbanView'
import { IssuesListView } from '@/components/issues/IssuesListView'
import { IssuesTopbarActions } from '@/components/issues/IssuesTopbarActions'
import { IssueViewTabs } from '@/components/issues/IssueViewTabs'
import { NewIssueDialog } from '@/components/issues/NewIssueDialog'
import { Pill } from '@/components/ui/pill'
import { ErrorState } from '@/components/ui/state-error'
import { useIssues } from '@/hooks/useIssues'
import { useIssuesView } from '@/hooks/useIssuesView'
import { useViewer } from '@/hooks/useViewer'
import { EMPTY_FILTERS, parseIssuesSearch, resolveSearch } from '@/lib/issues/searchParams'
import { issuesQuery, launchQueueQuery } from '@/lib/queries'
import { isVisualParityState } from '@/lib/visualParityState'
import { usePageActions } from '@/shell/usePageActions'
import { useCommandBarStore } from '@/stores/commandBar'
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
import { Inbox } from 'lucide-react'

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
	const openCommandBar = useCommandBarStore((s) => s.openBar)
	const { viewerId } = useViewer()
	const [showDonePref, setShowDonePref] = useState(readShowDonePref)
	const resolved = useMemo(
		() => resolveSearch(rawSearch, viewerId, showDonePref),
		[rawSearch, viewerId, showDonePref]
	)

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
	const [newDialogOpen, setNewDialogOpen] = useState(false)
	const visualLoading = isVisualParityState('issues-list-loading')

	const defaultTeamId = useMemo(() => {
		const ordered = data.issues.toSorted(
			(a, b) => Date.parse(b.issue.updated_at) - Date.parse(a.issue.updated_at)
		)
		return ordered.find((wrapper) => wrapper.issue.team_id)?.issue.team_id ?? null
	}, [data.issues])

	const onNewIssue = useCallback(() => setNewDialogOpen(true), [])

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
			navigate({ search: (prev) => ({ ...prev, sort: next === 'priority' ? undefined : next }) })
		},
		[navigate]
	)

	const onGroupChange = useCallback(
		(next: IssueGroupBy) => {
			navigate({ search: (prev) => ({ ...prev, group: next === 'status' ? undefined : next }) })
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

	const onClearFilters = useCallback(() => {
		navigate({ search: (prev) => ({ ...prev, ...serializeFilters(EMPTY_FILTERS) }) })
	}, [navigate])

	const onBrowseAllOpen = useCallback(() => {
		navigate({
			search: (prev) => ({ ...prev, ...serializeFilters(EMPTY_FILTERS), tab: 'all-open' })
		})
	}, [navigate])

	const onToggleDone = useCallback(() => {
		const next = !resolved.showDone
		setShowDonePref(next)
		writeShowDonePref(next)
		navigate({
			search: (prev) => ({ ...prev, showDone: next ? true : undefined })
		})
	}, [navigate, resolved.showDone])

	const isInitialLoading = data.loading && data.issues.length === 0
	const showIssueChrome = visualLoading || data.issues.length > 0

	usePageActions({
		title: 'Issues',
		sub: useMemo(
			() => (
				<Pill tone="neutral" mono size="xs">
					{view.total} open
				</Pill>
			),
			[view.total]
		),
		right: useMemo(
			() => <IssuesTopbarActions onSearch={openCommandBar} onNew={onNewIssue} />,
			[openCommandBar, onNewIssue]
		)
	})

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{data.error ? (
				<div className="px-6 py-4">
					<ErrorState message={data.error} onRetry={data.refresh} density="compact" />
				</div>
			) : null}

			{isInitialLoading ? <IssueRowSkeleton rows={8} /> : null}

			{!data.loading && data.issues.length === 0 ? (
				<IssuesEmptyState
					icon={Inbox}
					title="No issues yet"
					description="Once Linear sends issues into Superkick, they'll show up here."
				/>
			) : null}

			{showIssueChrome ? (
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

					{visualLoading ? (
						<IssueRowSkeleton rows={12} />
					) : resolved.view === 'board' ? (
						<IssuesKanbanView
							boardColumns={view.boardColumns}
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
							onClearFilters={onClearFilters}
							onBrowseAllOpen={onBrowseAllOpen}
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
			<NewIssueDialog
				open={newDialogOpen}
				onOpenChange={setNewDialogOpen}
				defaultTeamId={defaultTeamId}
			/>
		</div>
	)
}

function buildFilterOptions(issues: readonly IssueWithState[]): FilterOptionSet {
	const assignees = new Map<string, string>()
	const statuses = new Map<string, string>()
	const priorities = new Map<number, string>()
	const labels = new Map<string, string>()
	const projects = new Set<string>()
	const repos = new Set<string>()

	for (const wrapper of issues) {
		const issue: LinearIssueListItem = wrapper.issue
		if (issue.assignee) assignees.set(issue.assignee.id, issue.assignee.name)
		statuses.set(issue.status.state_type, issue.status.name)
		priorities.set(issue.priority.value, issue.priority.label)
		for (const label of issue.labels) labels.set(label.name, label.color)
		if (issue.project) projects.add(issue.project.name)
		if (wrapper.linkedRun) repos.add(wrapper.linkedRun.run.repo_slug)
	}

	return {
		assignees: [...assignees.entries()].map(([id, name]) => ({ id, name })),
		statuses: [...statuses.entries()].map(([state_type, name]) => ({ state_type, name })),
		priorities: [...priorities.entries()].map(([value, label]) => ({ value, label })),
		labels: [...labels.entries()].map(([name, color]) => ({ name, color })),
		projects: [...projects],
		repos: [...repos]
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
		project: nonEmpty(filters.project),
		repo: nonEmpty(filters.repo),
		task: nonEmpty(filters.task),
		created: nonEmpty(filters.created),
		updated: nonEmpty(filters.updated),
		completed: nonEmpty(filters.completed),
		has_sub_issues: nonEmpty(filters.has_sub_issues)
	}
}

function nonEmpty<T>(values: T[]): T[] | undefined {
	return values.length === 0 ? undefined : values
}

const SHOW_DONE_KEY = 'superkick.issues.showDone'

function readShowDonePref(): boolean {
	if (typeof window === 'undefined') return false
	return window.localStorage.getItem(SHOW_DONE_KEY) === 'true'
}

function writeShowDonePref(value: boolean) {
	if (typeof window === 'undefined') return
	try {
		window.localStorage.setItem(SHOW_DONE_KEY, String(value))
	} catch {
		return
	}
}
