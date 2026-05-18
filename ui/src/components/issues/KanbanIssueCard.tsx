import { IssueExtraBadges } from '@/components/issues/IssueExtraBadges'
import { SeverityPill } from '@/components/issues/SeverityPill'
import { LaunchQueueBlockerList } from '@/components/launch-queue/LaunchQueueBlockerList'
import { LaunchQueueUnblockBadge } from '@/components/launch-queue/LaunchQueueUnblockBadge'
import { Button } from '@/components/ui/button'
import { formatShortDate } from '@/lib/format'
import type { LaunchQueueItem } from '@/types'
import { Avatar } from '@/ui/Avatar'
import { Link } from '@tanstack/react-router'

interface KanbanIssueCardProps {
	item: Extract<LaunchQueueItem, { kind: 'issue' }>
	refTime: number
	onDispatch: (issueIdentifier: string) => void
	dispatchPending: boolean
	unblockedAt: string | undefined
	dispatchPosition: number | undefined
}

export function KanbanIssueCard({
	item,
	refTime,
	onDispatch,
	dispatchPending,
	unblockedAt,
	dispatchPosition
}: KanbanIssueCardProps) {
	const canDispatch = item.bucket === 'launchable'
	const dispatchLabel = dispatchPending ? 'Dispatching…' : 'Dispatch'
	const showBlockers = item.bucket === 'blocked' && item.issue.blocked_by.length > 0
	const assigneeName = item.issue.assignee?.name

	return (
		<div className="flex flex-col gap-2.5 rounded-lg border border-border bg-raised p-3 transition-colors hover:border-border-strong">
			<Link
				to="/issues/$issueId"
				params={{ issueId: item.issue.id }}
				className="flex flex-col gap-2 rounded focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
			>
				<div className="flex items-center gap-2">
					<span className="font-mono text-[11px] text-fg-dim">{item.issue.identifier}</span>
					<span className="flex-1" />
					<SeverityPill value={item.issue.priority.value} />
				</div>

				<p className="line-clamp-2 text-[12.5px] leading-snug font-medium text-fg">
					{item.issue.title}
				</p>

				<div className="flex items-center gap-2">
					{assigneeName ? <Avatar name={assigneeName} size={18} /> : null}
					<IssueExtraBadges item={item} dispatchPosition={dispatchPosition} />
					<span className="flex-1" />
					<span className="text-[10.5px] text-fg-dim">
						{formatShortDate(item.issue.updated_at)}
					</span>
				</div>
			</Link>

			{showBlockers ? <LaunchQueueBlockerList blockers={item.issue.blocked_by} /> : null}
			{unblockedAt ? <LaunchQueueUnblockBadge resolvedAt={unblockedAt} refTime={refTime} /> : null}
			{canDispatch ? (
				<Button
					variant="secondary"
					size="xs"
					disabled={dispatchPending}
					onClick={() => onDispatch(item.issue.identifier)}
					className="self-start font-mono text-[11px]"
					aria-label={`Dispatch ${item.issue.identifier}`}
				>
					{dispatchLabel}
				</Button>
			) : null}
		</div>
	)
}
