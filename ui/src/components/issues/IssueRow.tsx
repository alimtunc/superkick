import type { LinearIssueListItem } from '@/types'
import { Link } from '@tanstack/react-router'

export function IssueRow({ issue }: { issue: LinearIssueListItem }) {
	return (
		<Link
			to="/issues/$issueId"
			params={{ issueId: issue.id }}
			className="panel panel-hover flex items-center gap-4 px-4 py-3"
		>
			<span className="font-data w-16 shrink-0 text-[11px] font-medium text-fog">
				{issue.identifier}
			</span>

			<span
				className="inline-block w-20 shrink-0 rounded px-2 py-0.5 text-center text-[10px] font-medium"
				style={{
					color: issue.status.color,
					backgroundColor: `${issue.status.color}15`
				}}
			>
				{issue.status.name}
			</span>

			<span className="font-data min-w-0 flex-1 truncate text-[12px] text-silver">{issue.title}</span>

			<span className="font-data shrink-0 text-[10px] text-dim">{issue.priority.label}</span>

			{issue.assignee ? (
				<span className="font-data shrink-0 text-[10px] text-dim">{issue.assignee.name}</span>
			) : null}
		</Link>
	)
}
