import { KanbanIssueCard } from '@/components/issues/KanbanIssueCard'
import { KanbanRunCard } from '@/components/issues/KanbanRunCard'
import type { IssueState, LaunchQueueItem } from '@/types'

interface KanbanCardProps {
	item: LaunchQueueItem
	state: IssueState
	refTime: number
	onDispatch: (issueIdentifier: string) => void
	dispatchPending: boolean
	unblockedAt: string | undefined
	dispatchPosition: number | undefined
}

export function KanbanCard({
	item,
	state,
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
				state={state}
			/>
		)
	}
	return <KanbanRunCard item={item} refTime={refTime} />
}
