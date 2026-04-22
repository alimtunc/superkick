import { PriorityIcon } from '@/components/issues/PriorityIcon'
import { StatusIcon } from '@/components/issues/StatusIcon'
import { Button } from '@/components/ui/button'
import type { LaunchQueueItem } from '@/types'
import { Link } from '@tanstack/react-router'

interface LaunchQueueIssueCardProps {
	item: Extract<LaunchQueueItem, { kind: 'issue' }>
	onDispatch: (issueIdentifier: string) => void
	dispatchPending: boolean
}

/**
 * Card for a Linear issue with no live run. The `<Link>` only wraps the
 * identifier row so the Dispatch button is a sibling interactive element
 * rather than a nested one — avoids the "button inside link" a11y pattern
 * (SR announcing the button as part of the link target, clicks activating
 * both) while keeping the rest of the card clickable via the title row.
 */
export function LaunchQueueIssueCard({ item, onDispatch, dispatchPending }: LaunchQueueIssueCardProps) {
	const canDispatch = item.bucket === 'launchable'
	const dispatchLabel = dispatchPending ? 'Dispatching…' : 'Dispatch'

	return (
		<div
			className="group flex flex-col gap-1.5 px-3 py-2.5 transition-colors hover:bg-slate-deep/50"
			title={item.reason}
		>
			<Link to="/issues/$issueId" params={{ issueId: item.issue.id }} className="flex flex-col gap-1">
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
					<span className="font-data truncate text-[11px] text-silver">{item.issue.title}</span>
				</div>
			</Link>
			<p className="font-data line-clamp-2 text-[10px] text-dim">{item.reason}</p>
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
