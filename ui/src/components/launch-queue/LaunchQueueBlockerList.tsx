import { StatusIcon } from '@/components/issues/StatusIcon'
import type { IssueBlockerRef } from '@/types'

interface LaunchQueueBlockerListProps {
	blockers: IssueBlockerRef[]
}

/**
 * Inline list of Linear blockers gating an issue (SUP-81). Rendered on
 * `Blocked` items so the operator reads "Blocked by SUP-77 (In Progress)"
 * without opening the issue detail. Terminal blockers are already filtered
 * server-side by the classifier reason; this renders the raw relation set so
 * the operator also sees resolved context when inspecting a card.
 */
export function LaunchQueueBlockerList({ blockers }: LaunchQueueBlockerListProps) {
	if (blockers.length === 0) return null
	return (
		<ul className="font-data flex flex-wrap gap-1 text-[10px] text-dim">
			{blockers.map((blocker) => (
				<li
					key={blocker.id}
					className="inline-flex items-center gap-1 rounded border border-edge/60 bg-slate-deep/40 px-1.5 py-0.5"
				>
					<span className="text-silver">{blocker.identifier}</span>
					<span className="flex w-3 shrink-0 items-center justify-center">
						<StatusIcon stateType={blocker.status.state_type} color={blocker.status.color} />
					</span>
					<span>{blocker.status.name}</span>
				</li>
			))}
		</ul>
	)
}
