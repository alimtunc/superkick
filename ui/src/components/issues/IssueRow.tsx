import { LabelChip } from '@/components/issue-detail/LabelChip'
import { AssigneeAvatar } from '@/components/issues/AssigneeAvatar'
import { HoverCard } from '@/components/issues/HoverCard'
import { IssuePreview } from '@/components/issues/IssuePreview'
import { ProjectTag } from '@/components/issues/ProjectTag'
import { TaskDot } from '@/components/issues/TaskDot'
import { fmtRelativeShort } from '@/lib/domain/formatters'
import { subIssueCount } from '@/lib/issues/subIssues'
import { taskBadgeKindFor } from '@/lib/issues/taskBadge'
import { cn } from '@/lib/utils'
import type { IssueWithState, LifecycleBucket } from '@/types'
import { Icon, PriorityIcon, priorityIconKindFromValue, StatusIcon, statusIconKindFor } from '@/ui'
import { Link } from '@tanstack/react-router'

interface IssueRowProps {
	wrapper: IssueWithState
	bucket: LifecycleBucket
	focused?: boolean
	now?: Date
}

const MAX_LABELS = 2

export function IssueRow({ wrapper, bucket, focused = false, now }: IssueRowProps) {
	const issue = wrapper.issue
	const taskKind = taskBadgeKindFor(wrapper, bucket, now)
	const visibleLabels = issue.labels.slice(0, MAX_LABELS)
	const extraLabels = issue.labels.length - visibleLabels.length
	const subCount = subIssueCount(issue.children)
	const assignee = issue.assignee

	return (
		<HoverCard openDelay={350} content={<IssuePreview wrapper={wrapper} bucket={bucket} />}>
			<Link
				to="/issues/$issueId"
				params={{ issueId: issue.identifier }}
				data-issue-row
				data-identifier={issue.identifier}
				className={cn('row', focused ? 'row--kbd' : null)}
			>
				<span>
					<PriorityIcon kind={priorityIconKindFromValue(issue.priority.value)} size={16} />
				</span>

				<span>
					<StatusIcon kind={statusIconKindFor(issue.status)} size={14} />
				</span>

				<span className="row__id mono">{issue.identifier}</span>

				<span className="row__main">
					<span className="row__title">{issue.title}</span>
					{subCount.total > 0 ? (
						<span className="row__subcount">
							<Icon name="layers" size={11} className="ic" />
							{subCount.total}
						</span>
					) : null}
					{visibleLabels.length > 0 ? (
						<span className="row__labels">
							{visibleLabels.map((label) => (
								<LabelChip key={label.name} label={label} />
							))}
							{extraLabels > 0 ? (
								<span
									className="font-data text-[11px] text-fg-dim"
									title={`${extraLabels} more label${extraLabels === 1 ? '' : 's'}`}
								>
									+{extraLabels}
								</span>
							) : null}
						</span>
					) : null}
				</span>

				<span className="row__meta">
					{issue.project ? <ProjectTag name={issue.project.name} /> : null}
					<span className="row__updated">
						{fmtRelativeShort(issue.updated_at, (now ?? new Date()).getTime())}
					</span>
					<span className="avatar-cell">
						<AssigneeAvatar
							name={assignee?.name ?? null}
							avatarUrl={assignee?.avatar_url ?? null}
							size={20}
						/>
					</span>
					<span className="row__agent">{taskKind ? <TaskDot kind={taskKind} /> : null}</span>
				</span>
			</Link>
		</HoverCard>
	)
}
