import { AssigneeAvatar } from '@/components/issues/AssigneeAvatar'
import { IssueExtraBadges } from '@/components/issues/IssueExtraBadges'
import { IssueStatePill } from '@/components/issues/IssueStatePill'
import { SeverityPill } from '@/components/issues/SeverityPill'
import { formatShortDate } from '@/lib/format'
import type { IssueState, LaunchQueueItem, LinearIssueListItem } from '@/types'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'

interface IssueListRowProps {
	issue: LinearIssueListItem
	state: IssueState
	queueItem: LaunchQueueItem | undefined
}

export function IssueListRow({ issue, state, queueItem }: IssueListRowProps) {
	const linkedRun =
		queueItem?.kind === 'run' && queueItem.linked_issue?.identifier === issue.identifier
			? queueItem
			: undefined

	const repo = linkedRun?.run.repo_slug ?? null

	return (
		<Link
			to="/issues/$issueId"
			params={{ issueId: issue.id }}
			className="group flex h-9 flex-1 items-center gap-3 pr-6 transition-colors hover:bg-raised focus-visible:bg-raised focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
		>
			<span className="w-14 shrink-0 truncate font-mono text-[11.5px] text-fg-dim">
				{issue.identifier}
			</span>

			<span className="flex w-8 shrink-0 justify-center">
				<SeverityPill value={issue.priority.value} />
			</span>

			<div className="flex min-w-0 flex-1 items-center gap-2">
				<span className="truncate text-[13px] font-medium text-fg">{issue.title}</span>
				{issue.parent ? (
					<span className="inline-flex max-w-48 shrink-0 items-center gap-0.5 truncate font-mono text-[11px] text-fg-dim">
						<ChevronRight size={11} strokeWidth={1.75} aria-hidden="true" />
						{issue.parent.identifier}
					</span>
				) : null}
			</div>

			<div className="flex w-27.5 shrink-0 items-center justify-end gap-1.5">
				<IssueExtraBadges item={queueItem} />
				<IssueStatePill state={state} />
			</div>

			<span className="w-32.5 shrink-0 truncate font-mono text-[11.5px] text-fg-muted">
				{repo ?? <span className="text-fg-dim">—</span>}
			</span>

			<div className="flex w-27.5 shrink-0 items-center gap-1.5 overflow-hidden">
				{issue.assignee ? (
					<>
						<AssigneeAvatar name={issue.assignee.name} avatarUrl={issue.assignee.avatar_url} />
						<span className="truncate text-[12px] text-fg-muted">{issue.assignee.name}</span>
					</>
				) : (
					<span className="text-[12px] text-fg-dim">—</span>
				)}
			</div>

			<span className="w-14 shrink-0 text-right text-[11.5px] text-fg-dim">
				{formatShortDate(issue.updated_at)}
			</span>
		</Link>
	)
}
