import { PriorityIcon } from '@/components/issues/PriorityIcon'
import { StatusIcon } from '@/components/issues/StatusIcon'
import { LaunchQueueBlockerList } from '@/components/launch-queue/LaunchQueueBlockerList'
import { LaunchQueueUnblockBadge } from '@/components/launch-queue/LaunchQueueUnblockBadge'
import { Button } from '@/components/ui/button'
import type { LaunchQueueItem } from '@/types'
import { Link } from '@tanstack/react-router'

interface LaunchQueueIssueCardProps {
	item: Extract<LaunchQueueItem, { kind: 'issue' }>
	onDispatch: (issueIdentifier: string) => void
	dispatchPending: boolean
	/** ISO timestamp of the most recent `DependencyResolved` for this issue in
	 *  the current session (SUP-81). `undefined` when no resolution seen. */
	unblockedAt: string | undefined
	refTime: number
	/** 1-indexed position in the Launchable dispatch order, when applicable. */
	dispatchPosition: number | undefined
}

/**
 * Card for a Linear issue with no live run. The `<Link>` only wraps the
 * identifier row so the Dispatch button is a sibling interactive element
 * rather than a nested one — avoids the "button inside link" a11y pattern
 * (SR announcing the button as part of the link target, clicks activating
 * both) while keeping the rest of the card clickable via the title row.
 */
export function LaunchQueueIssueCard({
	item,
	onDispatch,
	dispatchPending,
	unblockedAt,
	refTime,
	dispatchPosition
}: LaunchQueueIssueCardProps) {
	const canDispatch = item.bucket === 'launchable'
	const dispatchLabel = dispatchPending ? 'Dispatching…' : 'Dispatch'
	const showBlockers = item.bucket === 'blocked' && item.issue.blocked_by.length > 0

	return (
		<div className="group flex flex-col gap-1.5 px-3 py-2.5 transition-colors hover:bg-slate-deep/50">
			<Link to="/issues/$issueId" params={{ issueId: item.issue.id }} className="flex flex-col gap-1">
				<div className="flex items-center gap-2">
					{dispatchPosition !== undefined ? (
						<span
							className="font-data shrink-0 rounded bg-neon-green/15 px-1.5 py-0.5 text-[10px] text-neon-green"
							aria-label={`Position ${dispatchPosition} in dispatch order`}
						>
							#{dispatchPosition}
						</span>
					) : null}
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
					<span className="font-data truncate text-[11px] text-silver">{item.issue.title}</span>
				</div>
			</Link>
			<p className="font-data line-clamp-2 text-[10px] text-dim">{item.reason}</p>
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
