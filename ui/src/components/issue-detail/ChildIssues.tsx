import { IssueRow } from '@/components/issues/IssueRow'
import type { IssueChildRef, LinearIssueListItem } from '@/types'

function childRefToListItem(child: IssueChildRef): LinearIssueListItem {
	return {
		id: child.id,
		identifier: child.identifier,
		title: child.title,
		status: child.status,
		team_id: null,
		priority: child.priority ?? { value: 0, label: 'None' },
		labels: child.labels ?? [],
		assignee: child.assignee ?? null,
		project: null,
		parent: null,
		children: [],
		blocked_by: [],
		url: '',
		created_at: child.updated_at ?? '',
		updated_at: child.updated_at ?? ''
	}
}

export function ChildIssues({ issues }: { issues: IssueChildRef[] }) {
	if (issues.length === 0) return null
	return (
		<div className="overflow-hidden rounded-md border border-border">
			{issues.map((child) => (
				<IssueRow key={child.id} issue={childRefToListItem(child)} indent />
			))}
		</div>
	)
}
