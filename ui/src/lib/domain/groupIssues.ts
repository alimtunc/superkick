import type { GroupedIssues, IssueGroup, LinearIssueListItem } from '@/types'

export function groupIssuesByParent(issues: LinearIssueListItem[]): GroupedIssues {
	const issueById = new Map<string, LinearIssueListItem>()
	for (const issue of issues) {
		issueById.set(issue.id, issue)
	}

	const childIds = new Set<string>()
	const parentChildMap = new Map<string, LinearIssueListItem[]>()

	for (const issue of issues) {
		if (!issue.parent) continue
		const parentId = issue.parent.id
		if (!issueById.has(parentId)) continue

		childIds.add(issue.id)
		const existing = parentChildMap.get(parentId) ?? []
		existing.push(issue)
		parentChildMap.set(parentId, existing)
	}

	const groups: IssueGroup[] = []
	const standalone: LinearIssueListItem[] = []

	for (const issue of issues) {
		if (childIds.has(issue.id)) continue

		const groupChildren = parentChildMap.get(issue.id)
		if (groupChildren && groupChildren.length > 0) {
			groups.push({ parent: issue, children: groupChildren })
		} else {
			standalone.push(issue)
		}
	}

	return { groups, standalone }
}
