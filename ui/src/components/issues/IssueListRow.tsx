import { LabelChip } from '@/components/issue-detail/LabelChip'
import { AssigneeAvatar } from '@/components/issues/AssigneeAvatar'
import { HoverCard } from '@/components/issues/HoverCard'
import { IssueExtraBadges } from '@/components/issues/IssueExtraBadges'
import { IssuePreview } from '@/components/issues/IssuePreview'
import { IssueStatePill } from '@/components/issues/IssueStatePill'
import { PriorityIcon } from '@/components/issues/PriorityIcon'
import { RunSummaryChip } from '@/components/issues/RunSummaryChip'
import { StatusIcon } from '@/components/issues/StatusIcon'
import { formatShortDate } from '@/lib/format'
import type { IssueState, LaunchQueueItem, LinearIssueListItem } from '@/types'
import { Link } from '@tanstack/react-router'

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

					{!indent && issue.parent ? (
						<span className="font-data max-w-48 shrink-0 truncate text-[11px] text-ash">
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
