import { PriorityIcon, StatusIcon, Btn } from '@/components/primitives'
import { LaunchQueueBlockerList } from '@/domains/launch/components/launch-queue/LaunchQueueBlockerList'
import { LaunchQueueUnblockBadge } from '@/domains/launch/components/launch-queue/LaunchQueueUnblockBadge'
import { priorityIconKindFromValue, statusIconKindFromLinear } from '@/lib/domain'
import type { LaunchQueueItem } from '@/types'
import { Link } from '@tanstack/react-router'

interface LaunchQueueIssueCardProps {
	item: Extract<LaunchQueueItem, { kind: 'issue' }>
	onDispatch: (issueIdentifier: string) => void
	dispatchPending: boolean
	/** ISO timestamp of the most recent `DependencyResolved` for this issue in
	 *  the current session. `undefined` when no resolution seen. */
	unblockedAt: string | undefined
	refTime: number
	/** 1-indexed position in the Launchable dispatch order, when applicable. */
	dispatchPosition: number | undefined
}

// Dispatch button is a sibling of the Link to avoid a button-inside-link a11y trap.
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
		<div className="kcard">
			<Link
				to="/issues/$issueId"
				params={{ issueId: item.issue.id }}
				className="block rounded focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
			>
				<div className="kcard__top">
					<StatusIcon
						kind={statusIconKindFromLinear(item.issue.status.state_type)}
						color={item.issue.status.color}
					/>
					<span className="kcard__id">{item.issue.identifier}</span>
					<span className="spacer" />
					{dispatchPosition !== undefined ? (
						<span
							className="pill pill--success mono"
							aria-label={`Position ${dispatchPosition} in dispatch order`}
						>
							#{dispatchPosition}
						</span>
					) : null}
					<PriorityIcon kind={priorityIconKindFromValue(item.issue.priority.value)} size={14} />
				</div>

				<p className="kcard__title line-clamp-2">{item.issue.title}</p>

				<p className="line-clamp-2 text-[10.5px] text-fg-muted">{item.reason}</p>
			</Link>

			{showBlockers || unblockedAt ? (
				<div className="kcard__foot flex-wrap">
					{showBlockers ? <LaunchQueueBlockerList blockers={item.issue.blocked_by} /> : null}
					{unblockedAt ? (
						<LaunchQueueUnblockBadge resolvedAt={unblockedAt} refTime={refTime} />
					) : null}
				</div>
			) : null}

			{canDispatch ? (
				<div className="kcard__foot">
					<Btn
						kind="secondary"
						size="sm"
						icon="play"
						disabled={dispatchPending}
						onClick={() => onDispatch(item.issue.identifier)}
						aria-label={`Dispatch ${item.issue.identifier}`}
					>
						{dispatchLabel}
					</Btn>
				</div>
			) : null}
		</div>
	)
}
