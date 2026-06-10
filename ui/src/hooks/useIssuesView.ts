import { useMemo } from 'react'

import { issueStateFromLinear } from '@/lib/domain/issueState'
import { taskBadgeKindFor } from '@/lib/issues/taskBadge'
import { bucketFor } from '@/lib/lifecycle'
import type { PillTone } from '@/types'
import type {
	IssueBoardColumns,
	IssueFilterState,
	IssueGroup,
	IssueGroupBy,
	IssueSort,
	IssueState,
	IssueTabCounts,
	IssueViewTab,
	IssueWithState,
	LifecycleBucket,
	StatusIconKind
} from '@/types'
import { statusIconKindFor } from '@/ui/StatusIcon'

interface UseIssuesViewInput {
	issues: readonly IssueWithState[]
	viewerId: string | null
	tab: IssueViewTab
	filters: IssueFilterState
	sort: IssueSort
	group: IssueGroupBy
	showDone: boolean
	now?: Date
}

interface UseIssuesViewResult {
	groups: IssueGroup[]
	boardColumns: IssueBoardColumns
	doneCountThisWeek: number
	total: number
	tabCounts: IssueTabCounts
	bucketByIdentifier: Map<string, LifecycleBucket>
}

const SHIPPED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const COMPLETED_WINDOW_MS: Record<string, number> = {
	'3d': 3 * 24 * 60 * 60 * 1000,
	'7d': 7 * 24 * 60 * 60 * 1000,
	'30d': 30 * 24 * 60 * 60 * 1000
}
const AGE_WINDOW_MS: Record<string, number> = {
	'24h': 24 * 60 * 60 * 1000,
	'7d': 7 * 24 * 60 * 60 * 1000,
	'30d': 30 * 24 * 60 * 60 * 1000
}

const LIFECYCLE_ORDER: readonly LifecycleBucket[] = ['needs', 'active', 'launchable', 'open', 'done']

const LIFECYCLE_LABELS: Record<LifecycleBucket, string> = {
	needs: 'Needs you',
	active: 'Active',
	launchable: 'Launchable',
	open: 'Open',
	done: 'Done'
}

const LIFECYCLE_TONES: Record<LifecycleBucket, PillTone> = {
	needs: 'warn',
	active: 'info',
	launchable: 'accent',
	open: 'neutral',
	done: 'success'
}

const LIFECYCLE_TO_STATUS_KIND: Record<LifecycleBucket, StatusIconKind> = {
	needs: 'needs',
	active: 'progress',
	launchable: 'todo',
	open: 'backlog',
	done: 'done'
}

// Linear's stock workflow labels. Custom workspace status names fall back to alphabetical.
const STATUS_GROUP_ORDER = new Map(
	['Needs you', 'In Progress', 'In Review', 'Todo', 'Backlog', 'Done', 'Canceled'].map((label, index) => [
		label,
		index
	])
)

/**
 * Single derivation that owns: lifecycle bucketing, tab presets, filter
 * application, sort, and grouping. Pure inside `useMemo`. Empty buckets
 * are dropped — the renderer never receives a zero-count group.
 *
 * `boardColumns` mirrors the same filtered/sorted view-model for the
 * kanban, so the list and the board cannot drift on tab/filter/viewer/
 * showDone state.
 */
export function useIssuesView(input: UseIssuesViewInput): UseIssuesViewResult {
	const { issues, viewerId, tab, filters, sort, group, showDone, now } = input
	const referenceMs = (now ?? new Date()).getTime()

	return useMemo(() => {
		const reference = new Date(referenceMs)
		const bucketByIdentifier = new Map<string, LifecycleBucket>()
		const buckets: Record<LifecycleBucket, IssueWithState[]> = {
			needs: [],
			active: [],
			launchable: [],
			open: [],
			done: []
		}

		for (const wrapper of issues) {
			const bucket = bucketFor(
				{
					issue: wrapper.issue,
					activeRun: wrapper.linkedRun ? { state: wrapper.linkedRun.run.state } : null,
					assigneeId: wrapper.issue.assignee?.id ?? null
				},
				viewerId
			)
			bucketByIdentifier.set(wrapper.issue.identifier, bucket)
			buckets[bucket].push(wrapper)
		}

		const tabCounts: IssueTabCounts = {
			mine: 0,
			'all-open': 0,
			shipped: 0
		}
		for (const wrapper of issues) {
			const bucket = bucketByIdentifier.get(wrapper.issue.identifier)
			if (!bucket) continue
			const isMine = viewerId !== null && wrapper.issue.assignee?.id === viewerId
			const isShipped = bucket === 'done' && shippedWithinWindow(wrapper, reference)
			if (bucket !== 'done' && isMine) tabCounts.mine += 1
			if (bucket !== 'done') tabCounts['all-open'] += 1
			if (isShipped) tabCounts.shipped += 1
		}

		const tabScoped = filterByTab(issues, bucketByIdentifier, tab, viewerId, reference, showDone)
		const filtered = applyFilters(tabScoped, bucketByIdentifier, filters, reference)
		const sorted = sortIssues(filtered, sort)

		const doneCountThisWeek = countShippedThisWeek(issues, bucketByIdentifier, reference)

		const groups = buildGroups(sorted, bucketByIdentifier, group, tab, showDone, reference)

		const boardColumns = groupBoardItems(sorted)

		return {
			groups,
			boardColumns,
			doneCountThisWeek,
			total: filtered.length,
			tabCounts,
			bucketByIdentifier
		}
	}, [issues, viewerId, tab, filters, sort, group, showDone, referenceMs])
}

function shippedWithinWindow(wrapper: IssueWithState, now: Date): boolean {
	const ts = wrapper.issue.completed_at
	if (!ts) return false
	const completed = new Date(ts).getTime()
	if (Number.isNaN(completed)) return false
	return now.getTime() - completed <= SHIPPED_WINDOW_MS
}

function countShippedThisWeek(
	issues: readonly IssueWithState[],
	bucketByIdentifier: Map<string, LifecycleBucket>,
	now: Date
): number {
	let n = 0
	for (const wrapper of issues) {
		if (
			bucketByIdentifier.get(wrapper.issue.identifier) === 'done' &&
			shippedWithinWindow(wrapper, now)
		) {
			n += 1
		}
	}
	return n
}

function filterByTab(
	issues: readonly IssueWithState[],
	bucketByIdentifier: Map<string, LifecycleBucket>,
	tab: IssueViewTab,
	viewerId: string | null,
	now: Date,
	showDone: boolean
): IssueWithState[] {
	if (tab === 'shipped') {
		return issues.filter(
			(w) => bucketByIdentifier.get(w.issue.identifier) === 'done' && shippedWithinWindow(w, now)
		)
	}
	const scoped = issues.filter((w) => {
		const bucket = bucketByIdentifier.get(w.issue.identifier)
		if (bucket !== 'done') return true
		return showDone && shippedWithinWindow(w, now)
	})
	if (tab === 'mine') {
		if (viewerId === null) return scoped
		return scoped.filter((w) => w.issue.assignee?.id === viewerId)
	}
	return scoped
}

function applyFilters(
	issues: IssueWithState[],
	bucketByIdentifier: Map<string, LifecycleBucket>,
	filters: IssueFilterState,
	now: Date
): IssueWithState[] {
	return issues.filter((wrapper) => {
		const issue = wrapper.issue
		if (filters.assignee.length > 0) {
			const id = issue.assignee?.id
			if (!id || !filters.assignee.includes(id)) return false
		}
		if (filters.status.length > 0 && !filters.status.includes(issue.status.state_type)) return false
		if (filters.status_not.length > 0 && filters.status_not.includes(issue.status.state_type))
			return false
		if (filters.priority.length > 0 && !filters.priority.includes(issue.priority.value)) return false
		if (filters.label.length > 0) {
			const names = issue.labels.map((l) => l.name)
			if (!filters.label.some((name) => names.includes(name))) return false
		}
		if (filters.label_not.length > 0) {
			const names = issue.labels.map((l) => l.name)
			if (filters.label_not.some((name) => names.includes(name))) return false
		}
		if (filters.project.length > 0) {
			const name = issue.project?.name
			if (!name || !filters.project.includes(name)) return false
		}
		if (filters.repo.length > 0) {
			const repo = wrapper.linkedRun?.run.repo_slug
			if (!repo || !filters.repo.includes(repo)) return false
		}
		if (filters.task.length > 0) {
			const bucket = bucketByIdentifier.get(issue.identifier) ?? 'open'
			const task = taskBadgeKindFor(wrapper, bucket, now)
			if (!task || !filters.task.includes(task)) return false
		}
		if (
			filters.created.length > 0 &&
			!ageMatches(issue.created_at, filters.created, now, AGE_WINDOW_MS)
		) {
			return false
		}
		if (
			filters.updated.length > 0 &&
			!ageMatches(issue.updated_at, filters.updated, now, AGE_WINDOW_MS)
		) {
			return false
		}
		if (filters.completed.length > 0) {
			const ts = issue.completed_at
			if (!ts) return false
			if (!ageMatches(ts, filters.completed, now, COMPLETED_WINDOW_MS)) return false
		}
		if (filters.has_sub_issues.length > 0) {
			const has = issue.children.length > 0
			const allowYes = filters.has_sub_issues.includes('yes')
			const allowNo = filters.has_sub_issues.includes('no')
			if (has && !allowYes) return false
			if (!has && !allowNo) return false
		}
		return true
	})
}

function ageMatches(
	timestamp: string,
	windows: readonly string[],
	now: Date,
	windowMap: Record<string, number>
): boolean {
	const ts = new Date(timestamp).getTime()
	if (Number.isNaN(ts)) return false
	const age = now.getTime() - ts
	return windows.some((w) => {
		const limit = windowMap[w]
		return limit !== undefined && age <= limit
	})
}

function sortIssues(issues: IssueWithState[], sort: IssueSort): IssueWithState[] {
	const copy = [...issues]
	switch (sort) {
		case 'updated':
			copy.sort(
				(a, b) => new Date(b.issue.updated_at).getTime() - new Date(a.issue.updated_at).getTime()
			)
			break
		case 'created':
			copy.sort(
				(a, b) => new Date(b.issue.created_at).getTime() - new Date(a.issue.created_at).getTime()
			)
			break
		case 'priority':
			copy.sort(
				(a, b) => prioritySortKey(a.issue.priority.value) - prioritySortKey(b.issue.priority.value)
			)
			break
		case 'age':
			copy.sort(
				(a, b) => new Date(a.issue.created_at).getTime() - new Date(b.issue.created_at).getTime()
			)
			break
	}
	return copy
}

// Linear priority is 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low. For "sort by
// priority" the operator means urgency-first — push 0 (None) to the end.
function prioritySortKey(value: number): number {
	if (value === 0) return Number.POSITIVE_INFINITY
	return value
}

function buildGroups(
	issues: IssueWithState[],
	bucketByIdentifier: Map<string, LifecycleBucket>,
	group: IssueGroupBy,
	tab: IssueViewTab,
	showDone: boolean,
	now: Date
): IssueGroup[] {
	if (group === 'none') {
		return issues.length === 0
			? []
			: [
					{
						key: 'all',
						bucket: null,
						label: 'All',
						tone: 'neutral',
						issues,
						statusKind: null,
						pinned: false
					}
				]
	}

	if (group === 'lifecycle') {
		return buildLifecycleGroups(issues, bucketByIdentifier, tab, showDone, now)
	}

	const remaining: IssueWithState[] = []
	const pinnedNeeds: IssueWithState[] = []
	const liftNeeds = tab !== 'shipped'
	for (const wrapper of issues) {
		if (liftNeeds && bucketByIdentifier.get(wrapper.issue.identifier) === 'needs') {
			pinnedNeeds.push(wrapper)
			continue
		}
		remaining.push(wrapper)
	}

	const grouped = new Map<string, IssueWithState[]>()
	for (const wrapper of remaining) {
		const key = keyForGroup(wrapper, group)
		const list = grouped.get(key) ?? []
		list.push(wrapper)
		grouped.set(key, list)
	}

	const out: IssueGroup[] = []
	for (const [key, list] of grouped) {
		out.push({
			key,
			bucket: null,
			label: key,
			tone: 'neutral',
			issues: list,
			statusKind: group === 'status' ? statusKindForGroup(list) : null,
			pinned: false
		})
	}
	out.sort((a, b) => compareGroupLabels(a.label, b.label, group))

	if (pinnedNeeds.length > 0) {
		out.unshift({
			key: 'pinned-needs',
			bucket: 'needs',
			label: LIFECYCLE_LABELS.needs,
			tone: LIFECYCLE_TONES.needs,
			issues: pinnedNeeds,
			statusKind: LIFECYCLE_TO_STATUS_KIND.needs,
			pinned: true
		})
	}
	return out
}

function statusKindForGroup(list: readonly IssueWithState[]): StatusIconKind | null {
	const first = list[0]
	if (!first) return null
	return statusIconKindFor(first.issue.status)
}

function compareGroupLabels(a: string, b: string, group: IssueGroupBy): number {
	if (group !== 'status') return a.localeCompare(b)
	const aRank = STATUS_GROUP_ORDER.get(a) ?? Number.POSITIVE_INFINITY
	const bRank = STATUS_GROUP_ORDER.get(b) ?? Number.POSITIVE_INFINITY
	if (aRank !== bRank) return aRank - bRank
	return a.localeCompare(b)
}

function buildLifecycleGroups(
	issues: IssueWithState[],
	bucketByIdentifier: Map<string, LifecycleBucket>,
	tab: IssueViewTab,
	showDone: boolean,
	now: Date
): IssueGroup[] {
	const order: readonly LifecycleBucket[] = tab === 'shipped' ? ['done'] : LIFECYCLE_ORDER

	const groupedByBucket: Record<LifecycleBucket, IssueWithState[]> = {
		needs: [],
		active: [],
		launchable: [],
		open: [],
		done: []
	}
	for (const wrapper of issues) {
		const bucket = bucketByIdentifier.get(wrapper.issue.identifier)
		if (!bucket) continue
		groupedByBucket[bucket].push(wrapper)
	}

	const out: IssueGroup[] = []
	for (const bucket of order) {
		const list = groupedByBucket[bucket]
		const pinned = bucket === 'needs'
		if (bucket === 'done' && tab !== 'shipped') {
			if (!showDone) continue
			const recent = list.filter((w) => shippedWithinWindow(w, now))
			if (recent.length === 0) continue
			out.push({
				key: bucket,
				bucket,
				label: LIFECYCLE_LABELS[bucket],
				tone: LIFECYCLE_TONES[bucket],
				issues: recent,
				statusKind: LIFECYCLE_TO_STATUS_KIND[bucket],
				pinned
			})
			continue
		}
		if (list.length === 0) continue
		out.push({
			key: bucket,
			bucket,
			label: LIFECYCLE_LABELS[bucket],
			tone: LIFECYCLE_TONES[bucket],
			issues: list,
			statusKind: LIFECYCLE_TO_STATUS_KIND[bucket],
			pinned
		})
	}
	return out
}

function keyForGroup(wrapper: IssueWithState, group: IssueGroupBy): string {
	const issue = wrapper.issue
	switch (group) {
		case 'status':
			return issue.status.name
		case 'priority':
			return issue.priority.label
		case 'project':
			return issue.project?.name ?? 'No project'
		case 'assignee':
			return issue.assignee?.name ?? 'Unassigned'
		default:
			return 'All'
	}
}

function groupBoardItems(issues: readonly IssueWithState[]): IssueBoardColumns {
	const groups: IssueBoardColumns = {
		needs_human: [],
		backlog: [],
		todo: [],
		in_progress: [],
		in_review: [],
		done: []
	}
	for (const wrapper of issues) {
		groups[columnForBoard(wrapper)].push(wrapper)
	}
	return groups
}

function columnForBoard(wrapper: IssueWithState): IssueState {
	const linkedState = wrapper.linkedRun?.run.state
	if (linkedState === 'waiting_human') return 'needs_human'
	if (linkedState === 'reviewing' || linkedState === 'opening_pr') return 'in_review'
	return wrapper.state ?? issueStateFromLinear(wrapper.issue.status.state_type)
}
