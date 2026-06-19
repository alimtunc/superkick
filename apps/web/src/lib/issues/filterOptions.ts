import type { FilterOptionSet } from '@/types'
import type { IssueFilterState, IssueWithState, LinearIssueListItem } from '@/types'

export function buildFilterOptions(issues: readonly IssueWithState[]): FilterOptionSet {
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

function nonEmpty<T>(values: T[]): T[] | undefined {
	return values.length === 0 ? undefined : values
}

export function serializeFilters(filters: IssueFilterState) {
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
