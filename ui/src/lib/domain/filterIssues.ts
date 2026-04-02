import type { LinearIssueListItem } from '@/types'

export function matchesSearch(issue: LinearIssueListItem, query: string): boolean {
	const lower = query.toLowerCase()
	return (
		issue.identifier.toLowerCase().includes(lower) ||
		issue.title.toLowerCase().includes(lower) ||
		issue.labels.some((label) => label.name.toLowerCase().includes(lower)) ||
		(issue.project?.name.toLowerCase().includes(lower) ?? false) ||
		(issue.assignee?.name.toLowerCase().includes(lower) ?? false) ||
		(issue.parent?.identifier.toLowerCase().includes(lower) ?? false) ||
		(issue.parent?.title.toLowerCase().includes(lower) ?? false)
	)
}

export function matchesLabels(issue: LinearIssueListItem, labels: Set<string>): boolean {
	if (labels.size === 0) return true
	return issue.labels.some((label) => labels.has(label.name))
}

export function matchesProject(issue: LinearIssueListItem, project: string | null): boolean {
	if (project === null) return true
	return issue.project?.name === project
}

interface FilterCriteria {
	search: string
	activeLabels: Set<string>
	activeProject: string | null
	activePriorities: Set<number>
}

export function filterIssuesWithNesting(
	bucketIssues: LinearIssueListItem[],
	criteria: FilterCriteria
): LinearIssueListItem[] {
	const { search, activeLabels, activeProject, activePriorities } = criteria
	const hasFilters =
		search.trim() || activeLabels.size > 0 || activeProject !== null || activePriorities.size > 0

	if (!hasFilters) return bucketIssues

	const bucketById = new Map<string, LinearIssueListItem>()
	for (const issue of bucketIssues) {
		bucketById.set(issue.id, issue)
	}

	const matchIds = new Set<string>()
	for (const issue of bucketIssues) {
		const searchMatch = !search.trim() || matchesSearch(issue, search.trim())
		const labelMatch = matchesLabels(issue, activeLabels)
		const projectMatch = matchesProject(issue, activeProject)
		const priorityMatch = activePriorities.size === 0 || activePriorities.has(issue.priority.value)
		if (searchMatch && labelMatch && projectMatch && priorityMatch) {
			matchIds.add(issue.id)
		}
	}

	const resultIds = new Set(matchIds)
	for (const id of matchIds) {
		const issue = bucketById.get(id)
		if (!issue) continue
		if (issue.parent && bucketById.has(issue.parent.id)) {
			resultIds.add(issue.parent.id)
		}
		for (const child of issue.children) {
			if (bucketById.has(child.id)) {
				resultIds.add(child.id)
			}
		}
	}

	return bucketIssues.filter((issue) => resultIds.has(issue.id))
}
