import { HoverCard } from '@/components/issues/HoverCard'
import { IssueExtraBadges } from '@/components/issues/IssueExtraBadges'
import { IssuePreview } from '@/components/issues/IssuePreview'
import { IssueStatePill } from '@/components/issues/IssueStatePill'
import { PriorityIcon } from '@/components/issues/PriorityIcon'
import { RunSummaryChip } from '@/components/issues/RunSummaryChip'
import { StatusIcon } from '@/components/issues/StatusIcon'
import type { IssueState, LaunchQueueItem, LinearIssueListItem } from '@/types'
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

interface IssueListRowProps {
	issue: LinearIssueListItem
	state: IssueState
	queueItem: LaunchQueueItem | undefined
	indent?: boolean
	refTime: number
}

export function IssueListRow({ issue, state, queueItem, indent = false, refTime }: IssueListRowProps) {
	const linkedRun =
		queueItem?.kind === 'run' && queueItem.linked_issue?.identifier === issue.identifier
			? queueItem
			: undefined

	return (
		<HoverCard content={<IssuePreview issue={issue} />}>
			<Link
				to="/issues/$issueId"
				params={{ issueId: issue.id }}
				className={`flex items-center gap-2.5 rounded-md px-3 py-2 transition-colors hover:bg-white/4 ${indent ? 'ml-7' : ''}`}
			>
				<span className="flex w-4 shrink-0 items-center justify-center">
					<PriorityIcon value={issue.priority.value} />
				</span>

				<span className="font-data w-14 shrink-0 text-[11px] text-dim">{issue.identifier}</span>

				<span className="flex w-4 shrink-0 items-center justify-center">
					<StatusIcon stateType={issue.status.state_type} color={issue.status.color} />
				</span>

				<div className="flex min-w-0 flex-1 items-center gap-2">
					<span className="font-data truncate text-[13px] text-silver">{issue.title}</span>

					{!indent && issue.parent ? (
						<span className="font-data max-w-48 shrink-0 truncate text-[11px] text-dim/50">
							&rsaquo; {issue.parent.identifier}
							{issue.project ? ` · ${issue.project.name}` : ''}
						</span>
					) : null}
				</div>

				<IssueStatePill state={state} />

				{linkedRun ? <RunSummaryChip item={linkedRun} refTime={refTime} /> : null}

				<IssueExtraBadges item={queueItem} />

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

				{issue.assignee ? (
					<span
						className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-600/80 text-[8px] font-bold text-white"
						title={issue.assignee.name}
					>
						{initials(issue.assignee.name)}
					</span>
				) : null}

				<span className="font-data w-12 shrink-0 text-right text-[11px] text-dim/50">
					{formatDate(issue.updated_at)}
				</span>
			</Link>
		</HoverCard>
	)
}
