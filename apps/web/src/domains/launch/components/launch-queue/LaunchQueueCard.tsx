import { LaunchQueueIssueCard } from '@/domains/launch/components/launch-queue/LaunchQueueIssueCard'
import { LaunchQueueRunCard } from '@/domains/launch/components/launch-queue/LaunchQueueRunCard'
import type { LaunchQueueItem } from '@/types'

interface LaunchQueueCardProps {
	item: LaunchQueueItem
	refTime: number
	onDispatch: (issueIdentifier: string) => void
	dispatchPending: boolean
	unblockedAt: string | undefined
	dispatchPosition: number | undefined
}

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
