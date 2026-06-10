import { useCallback, useMemo, useState } from 'react'

import { IssueFilterBar } from '@/components/issues/IssueFilterBar'
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
import { buildFilterOptions, serializeFilters } from '@/lib/issues/filterOptions'
import { EMPTY_FILTERS, parseIssuesSearch, resolveSearch } from '@/lib/issues/searchParams'
import { readShowDonePref, writeShowDonePref } from '@/lib/issues/showDonePref'
import { issuesQuery, launchQueueQuery } from '@/lib/queries'
import { isVisualParityState } from '@/lib/visualParityState'
import { usePageActions } from '@/shell/usePageActions'
import { useCommandBarStore } from '@/stores/commandBar'
import type { FilterOptionSet } from '@/types'
import type { IssueFilterState, IssueGroupBy, IssueSort, IssueViewLayout, IssueViewTab } from '@/types'
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
			() => (
				<IssuesTopbarActions
					onSearch={openCommandBar}
					onNew={onNewIssue}
					layout={resolved.view}
					onLayoutChange={onLayoutChange}
				/>
			),
			[openCommandBar, onNewIssue, resolved.view, onLayoutChange]
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
						options={options}
						onFiltersChange={onFiltersChange}
						onSortChange={onSortChange}
						onGroupChange={onGroupChange}
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
