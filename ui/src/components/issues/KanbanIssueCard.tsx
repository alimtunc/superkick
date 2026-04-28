import { IssueExtraBadges } from '@/components/issues/IssueExtraBadges'
import { PriorityIcon } from '@/components/issues/PriorityIcon'
import { StatusIcon } from '@/components/issues/StatusIcon'
import { LaunchQueueBlockerList } from '@/components/launch-queue/LaunchQueueBlockerList'
import { LaunchQueueUnblockBadge } from '@/components/launch-queue/LaunchQueueUnblockBadge'
import { Button } from '@/components/ui/button'
import type { LaunchQueueItem } from '@/types'
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

	return (
		<div className="group flex flex-col gap-1.5 rounded-md border border-edge bg-slate-deep px-3 py-2.5 transition-colors focus-within:border-edge-bright hover:border-edge-bright hover:bg-slate-deep/80">
			<Link
				to="/issues/$issueId"
				params={{ issueId: item.issue.id }}
				className="flex flex-col gap-1 rounded focus-visible:ring-2 focus-visible:ring-mineral/40 focus-visible:outline-none"
			>
				<div className="flex items-center gap-2">
					<span className="flex w-4 shrink-0 items-center justify-center">
						<PriorityIcon value={item.issue.priority.value} />
					</span>
					<span className="font-data shrink-0 text-[12px] font-medium text-fog transition-colors group-hover:text-neon-green">
						{item.issue.identifier}
					</span>
					<span className="flex w-4 shrink-0 items-center justify-center">
						<StatusIcon
							stateType={item.issue.status.state_type}
							color={item.issue.status.color}
						/>
					</span>
					<span className="truncate text-[12px] font-medium text-fog">{item.issue.title}</span>
				</div>
			</Link>
			<IssueExtraBadges item={item} dispatchPosition={dispatchPosition} />
			<p className="font-data line-clamp-2 text-[10px] text-ash">{item.reason}</p>
			{showBlockers ? <LaunchQueueBlockerList blockers={item.issue.blocked_by} /> : null}
			{unblockedAt ? <LaunchQueueUnblockBadge resolvedAt={unblockedAt} refTime={refTime} /> : null}
			{canDispatch ? (
				<Button
					variant="secondary"
					size="xs"
					disabled={dispatchPending}
					onClick={() => onDispatch(item.issue.identifier)}
					className="font-data self-start text-[11px]"
					aria-label={`Dispatch ${item.issue.identifier}`}
				>
					{dispatchLabel}
				</Button>
			) : null}
		</div>
	)
}
