import { LabelChip } from '@/components/issue-detail/LabelChip'
import { AssigneeAvatar } from '@/components/issues/AssigneeAvatar'
import { HoverCard } from '@/components/issues/HoverCard'
import { IssuePreview } from '@/components/issues/IssuePreview'
import { PriorityIcon } from '@/components/issues/PriorityIcon'
import { StatusIcon } from '@/components/issues/StatusIcon'
import { formatShortDate } from '@/lib/format'
import type { LinearIssueListItem } from '@/types'
import { Link } from '@tanstack/react-router'

export function IssueRow({ issue, indent = false }: { issue: LinearIssueListItem; indent?: boolean }) {
	const childrenDone = issue.children.filter(
		(c) => c.status.state_type === 'completed' || c.status.state_type === 'canceled'
	).length
	const hasProgress = issue.children.length > 0

	return (
		<HoverCard content={<IssuePreview issue={issue} />}>
			<Link
				to="/issues/$issueId"
				params={{ issueId: issue.id }}
				className={`group flex h-8 items-center gap-2.5 rounded-md border border-transparent px-3 transition-colors hover:border-edge-bright hover:bg-slate-deep/40 focus-visible:ring-2 focus-visible:ring-mineral/40 focus-visible:outline-none ${indent ? 'ml-7' : ''}`}
			>
				<span className="flex w-4 shrink-0 items-center justify-center">
					<PriorityIcon value={issue.priority.value} />
				</span>

				<span className="font-data w-14 shrink-0 text-[11px] text-ash">{issue.identifier}</span>

				<span className="flex w-4 shrink-0 items-center justify-center">
					<StatusIcon stateType={issue.status.state_type} color={issue.status.color} />
				</span>

				<div className="flex min-w-0 flex-1 items-center gap-2">
					<span className="truncate text-[13px] font-medium text-fog">{issue.title}</span>

					{hasProgress ? (
						<span className="font-data shrink-0 text-[11px] text-ash">
							{childrenDone}/{issue.children.length}
						</span>
					) : null}

					{!indent && issue.parent ? (
						<span className="font-data max-w-48 shrink-0 truncate text-[11px] text-ash">
							&rsaquo; {issue.parent.identifier}
							{issue.project ? ` · ${issue.project.name}` : ''}
						</span>
					) : null}
				</div>

				{issue.labels.length > 0 ? (
					<div className="flex shrink-0 items-center gap-1.5">
						{issue.labels.slice(0, 3).map((label) => (
							<LabelChip key={label.name} label={label} />
						))}
					</div>
				) : null}

				{issue.assignee ? <AssigneeAvatar name={issue.assignee.name} /> : null}

				<span className="font-data w-12 shrink-0 text-right text-[11px] text-ash">
					{formatShortDate(issue.updated_at)}
				</span>
			</Link>
		</HoverCard>
	)
}
