import { LabelChip } from '@/components/issue-detail/LabelChip'
import { AssigneeAvatar } from '@/components/issues/AssigneeAvatar'
import { HoverCard } from '@/components/issues/HoverCard'
import { IssuePreview } from '@/components/issues/IssuePreview'
import { fmtRelativeShort } from '@/lib/domain/formatters'
import { taskBadgeKindFor } from '@/lib/issues/taskBadge'
import { cn } from '@/lib/utils'
import type { IssueWithState, LifecycleBucket } from '@/types'
import {
	Icon,
	PriorityIcon,
	priorityIconKindFromValue,
	StatusIcon,
	statusIconKindFromLinear,
	TaskBadge
} from '@/ui'
import { Link } from '@tanstack/react-router'

interface IssueRowProps {
	wrapper: IssueWithState
	bucket: LifecycleBucket
	focused?: boolean
	now?: Date
}

export function IssueRow({ wrapper, bucket, focused = false, now }: IssueRowProps) {
	const issue = wrapper.issue
	const badgeKind = taskBadgeKindFor(wrapper, bucket, now)

	return (
		<HoverCard openDelay={350} content={<IssuePreview wrapper={wrapper} bucket={bucket} />}>
			<Link
				to="/issues/$issueId"
				params={{ issueId: issue.identifier }}
				data-issue-row
				data-identifier={issue.identifier}
				className={cn(
					'group flex h-8 items-center gap-2 border-b border-border px-6 transition-colors hover:bg-raised focus-visible:bg-raised focus-visible:outline-none',
					focused ? 'bg-raised ring-1 ring-accent-soft ring-inset' : null
				)}
			>
				<span className="flex w-3.5 shrink-0 items-center justify-center">
					<PriorityIcon kind={priorityIconKindFromValue(issue.priority.value)} size={12} />
				</span>

				<span className="font-data w-15 shrink-0 truncate text-[11px] text-fg-dim">
					{issue.identifier}
				</span>

				<span className="flex w-3.5 shrink-0 items-center justify-center">
					<StatusIcon kind={statusIconKindFromLinear(issue.status.state_type)} size={13} />
				</span>

				<span className="min-w-0 flex-1 truncate text-[13px] text-fg">{issue.title}</span>

				<TaskBadge kind={badgeKind} mono className="shrink-0" />

				{issue.labels.length > 0 ? (
					<div className="flex shrink-0 items-center gap-1">
						{issue.labels.slice(0, 2).map((label) => (
							<LabelChip key={label.name} label={label} />
						))}
					</div>
				) : null}

				{issue.project ? (
					<span className="font-data inline-flex shrink-0 items-center gap-0.5 truncate text-[11px] text-fg-dim">
						<Icon name="chev" size={11} />
						{issue.project.name}
					</span>
				) : null}

				<AssigneeAvatar
					name={issue.assignee?.name ?? null}
					avatarUrl={issue.assignee?.avatar_url ?? null}
					size={18}
				/>

				<span className="font-data w-9 shrink-0 text-right text-[11px] text-fg-dim">
					{fmtRelativeShort(issue.updated_at, (now ?? new Date()).getTime())}
				</span>
			</Link>
		</HoverCard>
	)
}
