import { LaunchQueueIssueCard } from '@/components/launch-queue/LaunchQueueIssueCard'
import { LaunchQueueRunCard } from '@/components/launch-queue/LaunchQueueRunCard'
import type { LaunchQueueItem } from '@/types'

interface LaunchQueueCardProps {
	item: LaunchQueueItem
	refTime: number
	onDispatch: (issueIdentifier: string) => void
	dispatchPending: boolean
}

/**
 * Discriminator for the launch-queue card. Each `LaunchQueueItemKind`
 * variant renders in its own file (one-component-per-file) to keep the
 * kind-specific affordances — e.g. the Dispatch button only exists for
 * `launchable` issues — isolated.
 */
export function LaunchQueueCard({ item, refTime, onDispatch, dispatchPending }: LaunchQueueCardProps) {
	if (item.kind === 'issue') {
		return <LaunchQueueIssueCard item={item} onDispatch={onDispatch} dispatchPending={dispatchPending} />
	}
	return <LaunchQueueRunCard item={item} refTime={refTime} />
}
