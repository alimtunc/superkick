import { PriorityIcon } from '@/components/issues/PriorityIcon'
import { Button } from '@/components/ui/button'
import type { LaunchQueueItem } from '@/types'
import { Link } from '@tanstack/react-router'

interface ReadyToLaunchRowProps {
	item: Extract<LaunchQueueItem, { kind: 'issue' }>
	dispatchPosition: number
	onDispatch: (issueIdentifier: string) => void
	dispatchPending: boolean
}

/**
 * Compact dispatch row. The Link wraps only the identity column so the
 * Dispatch button stays a sibling — keeps screen-reader semantics clean
 * (no nested interactive elements) while the title row stays clickable.
 */
export function ReadyToLaunchRow({
	item,
	dispatchPosition,
	onDispatch,
	dispatchPending
}: ReadyToLaunchRowProps) {
	return (
		<div className="group flex items-center gap-3 px-3 py-2 transition-colors hover:bg-slate-deep/50">
			<span
				className="font-data shrink-0 rounded bg-neon-green/15 px-1.5 py-0.5 text-[10px] text-neon-green"
				aria-label={`Position ${dispatchPosition} in dispatch order`}
			>
				#{dispatchPosition}
			</span>
			<span className="flex w-4 shrink-0 items-center justify-center">
				<PriorityIcon value={item.issue.priority.value} />
			</span>
			<Link
				to="/issues/$issueId"
				params={{ issueId: item.issue.id }}
				className="flex min-w-0 flex-1 items-center gap-3"
			>
				<span className="font-data shrink-0 text-[12px] font-medium text-fog transition-colors group-hover:text-neon-green">
					{item.issue.identifier}
				</span>
				<span className="font-data flex-1 truncate text-[11px] text-silver">{item.issue.title}</span>
			</Link>
			<Button
				variant="secondary"
				size="xs"
				disabled={dispatchPending}
				onClick={() => onDispatch(item.issue.identifier)}
				className="font-data shrink-0 text-[10px] tracking-wider uppercase"
				aria-label={`Dispatch ${item.issue.identifier}`}
			>
				{dispatchPending ? 'Dispatching…' : 'Dispatch'}
			</Button>
		</div>
	)
}
