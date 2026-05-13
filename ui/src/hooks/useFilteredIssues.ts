import { useMemo } from 'react'

import {
	filterIssuesWithNesting,
	matchesLabels,
	matchesProject,
	matchesSearch
} from '@/lib/domain/filterIssues'
import { groupIssuesByParent } from '@/lib/domain/groupIssues'
import type {
	GroupedIssues,
	IssueState,
	IssueStateFilter,
	IssueWithState,
	LaunchQueueItem,
	LinearIssueListItem
} from '@/types'

interface IssueFilterState {
	activeIssueState: IssueStateFilter
	search: string
	activeLabels: Set<string>
	activeProject: string | null
	activePriorities: Set<number>
}

interface UseFilteredIssuesInput {
	allIssues: readonly IssueWithState[]
	queueItems: readonly LaunchQueueItem[]
	filters: IssueFilterState
}

type IssueStateCounts = Record<IssueState, number>

const EMPTY_COUNTS: IssueStateCounts = {
	backlog: 0,
	todo: 0,
	in_progress: 0,
	needs_human: 0,
	in_review: 0,
	done: 0
}

export function useFilteredIssues({ allIssues, queueItems, filters }: UseFilteredIssuesInput) {
	const { activeIssueState, search, activeLabels, activeProject, activePriorities } = filters

	const contentFiltered: IssueWithState[] = useMemo(() => {
		const trimmed = search.trim()
		return allIssues.filter((wrapper) => {
			const issue = wrapper.issue
			const searchMatch = !trimmed || matchesSearch(issue, trimmed)
			const labelMatch = matchesLabels(issue, activeLabels)
			const projectMatch = matchesProject(issue, activeProject)
			const priorityMatch = activePriorities.size === 0 || activePriorities.has(issue.priority.value)
			return searchMatch && labelMatch && projectMatch && priorityMatch
		})
	}, [allIssues, search, activeLabels, activeProject, activePriorities])

	const counts: IssueStateCounts = useMemo(() => {
		const next: IssueStateCounts = { ...EMPTY_COUNTS }
		for (const wrapper of contentFiltered) {
			next[wrapper.state] += 1
		}
		return next
	}, [contentFiltered])

	const stateScopedIssues: LinearIssueListItem[] = useMemo(() => {
		const scoped =
			activeIssueState === 'all'
				? contentFiltered
				: contentFiltered.filter((w) => w.state === activeIssueState)
		return scoped.map((w) => w.issue)
	}, [contentFiltered, activeIssueState])

	const filteredIssues: LinearIssueListItem[] = useMemo(
		() =>
			filterIssuesWithNesting(stateScopedIssues, {
				search,
				activeLabels,
				activeProject,
				activePriorities
			}),
		[stateScopedIssues, search, activeLabels, activeProject, activePriorities]
	)

	const grouped: GroupedIssues = useMemo(() => groupIssuesByParent(filteredIssues), [filteredIssues])

	const filteredQueueItems: LaunchQueueItem[] = useMemo(() => {
		const passing = new Set(contentFiltered.map((w) => w.issue.identifier))
		return queueItems.filter((item) => {
			if (item.kind === 'issue') return passing.has(item.issue.identifier)
			const linked = item.linked_issue?.identifier
			// Cross-team runs (no Linear metadata) only appear when no filters are active.
			if (!linked) {
				return (
					!search.trim() &&
					activeLabels.size === 0 &&
					activeProject === null &&
					activePriorities.size === 0
				)
			}
			return passing.has(linked)
		})
	}, [queueItems, contentFiltered, search, activeLabels, activeProject, activePriorities])

	return { counts, filteredIssues, grouped, filteredQueueItems }
}
