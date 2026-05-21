import { SeverityPill } from '@/components/issues/SeverityPill'
import { LaunchQueueBlockerList } from '@/components/launch-queue/LaunchQueueBlockerList'
import { LaunchQueueUnblockBadge } from '@/components/launch-queue/LaunchQueueUnblockBadge'
import { Button } from '@/components/ui/button'
import { Pill } from '@/components/ui/pill'
import type { LaunchQueueItem } from '@/types'
import { StatusIcon, statusIconKindFromLinear } from '@/ui'
import { Link } from '@tanstack/react-router'
import { Rocket } from 'lucide-react'

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
		<div className="flex flex-col gap-2.5 rounded-lg border border-border bg-raised p-3 transition-colors hover:border-border-strong">
			<Link
				to="/issues/$issueId"
				params={{ issueId: item.issue.id }}
				className="flex flex-col gap-2 rounded focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
			>
				<div className="flex items-center gap-2">
					<span className="font-mono text-[11px] text-fg-dim">{item.issue.identifier}</span>
					<span className="flex-1" />
					{dispatchPosition !== undefined ? (
						<Pill
							tone="live"
							size="xs"
							mono
							leading={<Rocket size={10} aria-hidden="true" />}
							aria-label={`Position ${dispatchPosition} in dispatch order`}
						>
							#{dispatchPosition}
						</Pill>
					) : null}
					<SeverityPill value={item.issue.priority.value} />
				</div>

				<p className="line-clamp-2 text-[12.5px] leading-snug font-medium text-fg">
					{item.issue.title}
				</p>

				<p className="line-clamp-2 text-[10.5px] text-fg-muted">{item.reason}</p>
			</Link>

			<div className="flex flex-wrap items-center gap-1.5">
				<span className="flex w-4 shrink-0 items-center justify-center">
					<StatusIcon
						kind={statusIconKindFromLinear(item.issue.status.state_type)}
						color={item.issue.status.color}
					/>
				</span>
				{showBlockers ? <LaunchQueueBlockerList blockers={item.issue.blocked_by} /> : null}
				{unblockedAt ? <LaunchQueueUnblockBadge resolvedAt={unblockedAt} refTime={refTime} /> : null}
			</div>

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
