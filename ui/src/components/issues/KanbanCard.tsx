import { KanbanIssueCard } from '@/components/issues/KanbanIssueCard'
import { KanbanRunCard } from '@/components/issues/KanbanRunCard'
import type { LaunchQueueItem } from '@/types'

interface KanbanCardProps {
	item: LaunchQueueItem
	refTime: number
	onDispatch: (issueIdentifier: string) => void
	dispatchPending: boolean
	unblockedAt: string | undefined
	dispatchPosition: number | undefined
}

export function KanbanCard({
	item,
	refTime,
	onDispatch,
	dispatchPending,
	unblockedAt,
	dispatchPosition
}: KanbanCardProps) {
	if (item.kind === 'issue') {
		return (
			<KanbanIssueCard
				item={item}
				onDispatch={onDispatch}
				dispatchPending={dispatchPending}
				unblockedAt={unblockedAt}
				refTime={refTime}
				dispatchPosition={dispatchPosition}
			/>
		)
	}
	return <KanbanRunCard item={item} refTime={refTime} />
}
