import { LaunchQueueIssueCard } from '@/components/launch-queue/LaunchQueueIssueCard'
import { LaunchQueueRunCard } from '@/components/launch-queue/LaunchQueueRunCard'
import type { LaunchQueueItem } from '@/types'

interface LaunchQueueCardProps {
	item: LaunchQueueItem
	refTime: number
	onDispatch: (issueIdentifier: string) => void
	dispatchPending: boolean
	/** ISO timestamp of a `DependencyResolved` for this issue, if observed in
	 *  the current session (SUP-81). Ignored for run cards. */
	unblockedAt: string | undefined
	/** 1-indexed position in the dispatch queue, set by the column for
	 *  Launchable items so the operator reads "this is next" without having
	 *  to count cards. `undefined` everywhere else. */
	dispatchPosition: number | undefined
}

/**
 * Discriminator for the launch-queue card. Each `LaunchQueueItemKind`
 * variant renders in its own file (one-component-per-file) to keep the
 * kind-specific affordances — e.g. the Dispatch button only exists for
 * `launchable` issues — isolated.
 */
export function LaunchQueueCard({
	item,
	refTime,
	onDispatch,
	dispatchPending,
	unblockedAt,
	dispatchPosition
}: LaunchQueueCardProps) {
	if (item.kind === 'issue') {
		return (
			<LaunchQueueIssueCard
				item={item}
				onDispatch={onDispatch}
				dispatchPending={dispatchPending}
				unblockedAt={unblockedAt}
				refTime={refTime}
				dispatchPosition={dispatchPosition}
			/>
		)
	}
	return <LaunchQueueRunCard item={item} refTime={refTime} />
}
