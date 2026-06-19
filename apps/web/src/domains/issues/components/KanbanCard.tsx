import { KanbanIssueCard } from '@/domains/issues/components/KanbanIssueCard'
import { KanbanRunCard } from '@/domains/issues/components/KanbanRunCard'
import { FEATURES } from '@/lib/features'
import type { IssueState, LaunchQueueItem } from '@/types'

interface KanbanCardProps {
	item: LaunchQueueItem
	state: IssueState
	refTime: number
	onDispatch: (issueIdentifier: string) => void
	dispatchPending: boolean
	unblockedAt: string | undefined
	dispatchPosition: number | undefined
	forceRunCards?: boolean
}

export function KanbanCard({
	item,
	state,
	refTime,
	onDispatch,
	dispatchPending,
	unblockedAt,
	dispatchPosition,
	forceRunCards
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
	if (!forceRunCards && !FEATURES.kanbanRunCards) return null
	return <KanbanRunCard item={item} refTime={refTime} />
}
