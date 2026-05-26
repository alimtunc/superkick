import { LabelChip } from '@/components/issue-detail/LabelChip'
import { AssigneeAvatar } from '@/components/issues/AssigneeAvatar'
import { HoverCard } from '@/components/issues/HoverCard'
import { IssuePreview } from '@/components/issues/IssuePreview'
import { TaskDot } from '@/components/issues/TaskDot'
import { fmtRelativeShort } from '@/lib/domain/formatters'
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
	const isDone = bucket === 'done'

	return (
		<HoverCard openDelay={350} content={<IssuePreview wrapper={wrapper} bucket={bucket} />}>
			<Link
				to="/issues/$issueId"
				params={{ issueId: issue.identifier }}
				data-issue-row
				data-identifier={issue.identifier}
				className={cn(
					'group flex h-9 items-center gap-2.5 border-b border-border pr-6 pl-5 transition-colors hover:bg-raised focus-visible:bg-raised focus-visible:outline-none',
					focused ? 'bg-raised ring-1 ring-accent-soft ring-inset' : null
				)}
			>
				<span className="flex w-3.5 shrink-0 items-center justify-center">
					<PriorityIcon kind={priorityIconKindFromValue(issue.priority.value)} size={12} />
				</span>

				<span className="flex w-3.5 shrink-0 items-center justify-center">
					<StatusIcon kind={statusIconKindFor(issue.status)} size={13} />
				</span>

				<span className="font-data w-15 shrink-0 truncate text-[11px] text-fg-dim">
					{issue.identifier}
				</span>

				<span
					className={cn(
						'min-w-0 flex-1 truncate text-[13px]',
						isDone ? 'text-fg-muted' : 'text-fg'
					)}
				>
					{issue.title}
				</span>

				{visibleLabels.length > 0 ? (
					<div className="flex shrink-0 items-center gap-1">
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
					</div>
				) : null}

				{issue.project ? (
					<span className="font-data inline-flex shrink-0 items-center gap-1 truncate text-[11px] text-fg-dim">
						<Icon name="folder" size={11} />
						{issue.project.name}
					</span>
				) : null}

				<AssigneeAvatar
					name={issue.assignee?.name ?? null}
					avatarUrl={issue.assignee?.avatar_url ?? null}
					size={18}
				/>

				<span className="font-data w-10 shrink-0 text-right text-[11px] whitespace-nowrap text-fg-dim">
					{fmtRelativeShort(issue.updated_at, (now ?? new Date()).getTime())}
				</span>

				<span className="flex w-2 shrink-0 items-center justify-center">
					{taskKind ? <TaskDot kind={taskKind} /> : null}
				</span>
			</Link>
		</HoverCard>
	)
}
