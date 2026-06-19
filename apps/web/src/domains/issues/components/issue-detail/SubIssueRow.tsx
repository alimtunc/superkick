import { PriorityIcon, StatusIcon } from '@/components/primitives'
import { AssigneeAvatar } from '@/domains/issues/components/AssigneeAvatar'
import { priorityIconKindFromValue, statusIconKindFromLinear } from '@/lib/domain'
import { cn } from '@/lib/utils'
import type { IssueChildRef } from '@/types'
import { Link } from '@tanstack/react-router'

interface SubIssueRowProps {
	child: IssueChildRef
}

export function SubIssueRow({ child }: SubIssueRowProps) {
	const isDone = child.status.state_type === 'completed'
	return (
		<Link
			to="/issues/$issueId"
			params={{ issueId: child.identifier }}
			data-sub-issue-row
			data-identifier={child.identifier}
			className="group flex h-[30px] items-center gap-2.25 border-b border-border px-2.5 transition-colors last:border-b-0 hover:bg-raised focus-visible:bg-raised focus-visible:outline-none"
		>
			<span className="flex w-3.5 shrink-0 items-center justify-center">
				<PriorityIcon kind={priorityIconKindFromValue(child.priority.value)} size={12} />
			</span>
			<span className="flex w-3.5 shrink-0 items-center justify-center">
				<StatusIcon kind={statusIconKindFromLinear(child.status.state_type)} size={12} />
			</span>
			<span className="font-data w-15 shrink-0 truncate text-[11px] text-fg-dim">
				{child.identifier}
			</span>
			<span
				className={cn('min-w-0 flex-1 truncate text-[12.5px]', isDone ? 'text-fg-muted' : 'text-fg')}
			>
				{child.title}
			</span>
			{child.assignee ? (
				<AssigneeAvatar
					name={child.assignee.name}
					avatarUrl={child.assignee.avatar_url ?? null}
					size={18}
				/>
			) : null}
		</Link>
	)
}
