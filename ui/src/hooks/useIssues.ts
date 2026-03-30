import { useMemo, useState } from 'react'

import { fetchIssues } from '@/api'
import type { BucketFilter } from '@/components/issues/IssueFilters'
import { type ClassifiedIssues, classifyIssues } from '@/lib/domain/classifyIssues'
import { type GroupedIssues, groupIssuesByParent } from '@/lib/domain/groupIssues'
import { queryKeys } from '@/lib/queryKeys'
import type { LinearIssueListItem } from '@/types'
import { useQuery } from '@tanstack/react-query'

const EMPTY_ISSUES: never[] = []

function matchesSearch(issue: LinearIssueListItem, query: string): boolean {
	const q = query.toLowerCase()
	return (
		issue.identifier.toLowerCase().includes(q) ||
		issue.title.toLowerCase().includes(q) ||
		issue.labels.some((l) => l.name.toLowerCase().includes(q)) ||
		(issue.project?.name.toLowerCase().includes(q) ?? false) ||
		(issue.assignee?.name.toLowerCase().includes(q) ?? false) ||
		(issue.parent?.identifier.toLowerCase().includes(q) ?? false) ||
		(issue.parent?.title.toLowerCase().includes(q) ?? false)
	)
}

function matchesLabels(issue: LinearIssueListItem, labels: Set<string>): boolean {
	if (labels.size === 0) return true
	return issue.labels.some((l) => labels.has(l.name))
}

function matchesProject(issue: LinearIssueListItem, project: string | null): boolean {
	if (project === null) return true
	return issue.project?.name === project
}

export function useIssues(limit = 200) {
	const [activeBucket, setActiveBucket] = useState<BucketFilter>('all')
	const [search, setSearch] = useState('')
	const [activeLabels, setActiveLabels] = useState<Set<string>>(new Set())
	const [activeProject, setActiveProject] = useState<string | null>(null)
	const [activePriorities, setActivePriorities] = useState<Set<number>>(new Set())

	const { data, isLoading, error, dataUpdatedAt, refetch } = useQuery({
		queryKey: queryKeys.issues.list(limit),
		queryFn: () => fetchIssues(limit),
		refetchInterval: 30_000,
		staleTime: 15_000
	})

	const allIssues = data?.issues ?? EMPTY_ISSUES

	const { allLabels, labelCounts } = useMemo(() => {
		const counts = new Map<string, number>()
		for (const issue of allIssues) {
			for (const label of issue.labels) {
				counts.set(label.name, (counts.get(label.name) ?? 0) + 1)
			}
		}
		return { allLabels: [...counts.keys()].toSorted(), labelCounts: counts }
	}, [allIssues])

	const allProjects: string[] = useMemo(() => {
		const set = new Set<string>()
		for (const issue of allIssues) {
			if (issue.project) {
				set.add(issue.project.name)
			}
		}
		return [...set].toSorted()
	}, [allIssues])

	const classified: ClassifiedIssues = useMemo(() => classifyIssues(allIssues), [allIssues])

	const filteredIssues: LinearIssueListItem[] = useMemo(() => {
		const bucketIssues = activeBucket === 'all' ? allIssues : classified[activeBucket]
		const hasFilters =
			search.trim() || activeLabels.size > 0 || activeProject !== null || activePriorities.size > 0

		if (!hasFilters) return bucketIssues

		// Build lookup for the bucket
		const bucketById = new Map<string, LinearIssueListItem>()
		for (const issue of bucketIssues) {
			bucketById.set(issue.id, issue)
		}

		// Find directly matching issues
		const matchIds = new Set<string>()
		for (const issue of bucketIssues) {
			const s = !search.trim() || matchesSearch(issue, search.trim())
			const l = matchesLabels(issue, activeLabels)
			const p = matchesProject(issue, activeProject)
			const pr = activePriorities.size === 0 || activePriorities.has(issue.priority.value)
			if (s && l && p && pr) {
				matchIds.add(issue.id)
			}
		}

		// Preserve nesting: if a parent matches, keep children; if a child matches, keep parent
		const resultIds = new Set(matchIds)
		for (const id of matchIds) {
			const issue = bucketById.get(id)
			if (!issue) continue
			// Keep parent if child matched
			if (issue.parent && bucketById.has(issue.parent.id)) {
				resultIds.add(issue.parent.id)
			}
			// Keep children if parent matched
			for (const child of issue.children) {
				if (bucketById.has(child.id)) {
					resultIds.add(child.id)
				}
			}
		}

		return bucketIssues.filter((i) => resultIds.has(i.id))
	}, [classified, allIssues, activeBucket, search, activeLabels, activeProject, activePriorities])

	const grouped: GroupedIssues = useMemo(() => groupIssuesByParent(filteredIssues), [filteredIssues])

	function toggleLabel(label: string) {
		setActiveLabels((prev) => {
			const next = new Set(prev)
			if (next.has(label)) {
				next.delete(label)
			} else {
				next.add(label)
			}
			return next
		})
	}

	function clearLabels() {
		setActiveLabels(new Set())
	}

	function togglePriority(v: number) {
		setActivePriorities((prev) => {
			const next = new Set(prev)
			if (next.has(v)) {
				next.delete(v)
			} else {
				next.add(v)
			}
			return next
		})
	}

	function clearPriorities() {
		setActivePriorities(new Set())
	}

	function clearAllFilters() {
		clearLabels()
		setActiveProject(null)
		clearPriorities()
	}

	return {
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
		clearLabels,
		allProjects,
		activeProject,
		setActiveProject,
		activePriorities,
		togglePriority,
		clearPriorities,
		clearAllFilters,
		totalCount: data?.total_count ?? 0,
		loading: isLoading,
		error: error ? String(error) : null,
		lastRefresh: dataUpdatedAt ? new Date(dataUpdatedAt) : null,
		refresh: refetch
	}
}

export type IssuesData = ReturnType<typeof useIssues>
