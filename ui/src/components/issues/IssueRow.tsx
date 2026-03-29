import { HoverCard } from '@/components/issues/HoverCard'
import { IssuePreview } from '@/components/issues/IssuePreview'
import { PriorityIcon } from '@/components/issues/PriorityIcon'
import { StatusIcon } from '@/components/issues/StatusIcon'
import type { LinearIssueListItem } from '@/types'
import { Link } from '@tanstack/react-router'

function formatDate(iso: string): string {
	const d = new Date(iso)
	return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function initials(name: string): string {
	return name
		.split(' ')
		.map((w) => w[0])
		.join('')
		.toUpperCase()
		.slice(0, 2)
}

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
				className={`flex items-center gap-2.5 rounded-md px-3 py-2 transition-colors hover:bg-white/4 ${indent ? 'ml-7' : ''}`}
			>
				{/* Priority icon */}
				<span className="flex w-4 shrink-0 items-center justify-center">
					<PriorityIcon value={issue.priority.value} />
				</span>

				{/* Identifier */}
				<span className="font-data w-14 shrink-0 text-[11px] text-dim">{issue.identifier}</span>

				{/* Status icon */}
				<span className="flex w-4 shrink-0 items-center justify-center">
					<StatusIcon stateType={issue.status.state_type} color={issue.status.color} />
				</span>

				{/* Title + sub-issue progress + parent breadcrumb */}
				<div className="flex min-w-0 flex-1 items-center gap-2">
					<span className="font-data truncate text-[13px] text-silver">{issue.title}</span>

					{hasProgress ? (
						<span className="font-data shrink-0 text-[11px] text-dim">
							{childrenDone}/{issue.children.length}
						</span>
					) : null}

					{!indent && issue.parent ? (
						<span className="font-data max-w-48 shrink-0 truncate text-[11px] text-dim/50">
							&rsaquo; {issue.parent.identifier}
							{issue.project ? ` · ${issue.project.name}` : ''}
						</span>
					) : null}
				</div>

				{/* Labels */}
				{issue.labels.length > 0 ? (
					<div className="flex shrink-0 items-center gap-1.5">
						{issue.labels.slice(0, 3).map((label) => (
							<span
								key={label.name}
								className="font-data inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]"
								style={{ color: label.color, borderColor: `${label.color}40` }}
							>
								<span
									className="inline-block h-1.5 w-1.5 rounded-full"
									style={{ backgroundColor: label.color }}
								/>
								{label.name}
							</span>
						))}
					</div>
				) : null}

				{/* Assignee avatar */}
				{issue.assignee ? (
					<span
						className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-600/80 text-[8px] font-bold text-white"
						title={issue.assignee.name}
					>
						{initials(issue.assignee.name)}
					</span>
				) : null}

				{/* Date */}
				<span className="font-data w-12 shrink-0 text-right text-[11px] text-dim/50">
					{formatDate(issue.updated_at)}
				</span>
			</Link>
		</HoverCard>
	)
}
