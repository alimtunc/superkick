import { useMemo } from 'react'

import { KanbanColumn } from '@/components/issues/KanbanColumn'
import { KanbanIssueCard } from '@/components/issues/KanbanIssueCard'
import { useDispatchFromQueue } from '@/hooks/useDispatchFromQueue'
import { useIssueKanbanDnd } from '@/hooks/useIssueKanbanDnd'
import { useNow } from '@/hooks/useNow'
import { ISSUE_STATE_ORDER } from '@/lib/domain'
import { projectBoardColumns } from '@/lib/issues/issueBoardAdapter'
import type { IssueBoardColumns, IssueState, LaunchQueueItem, RecentUnblocks } from '@/types'
import { DndContext, DragOverlay } from '@dnd-kit/core'

interface IssuesKanbanViewProps {
	/** Pre-filtered, viewer/tab-scoped board projection from `useIssuesView`. */
	boardColumns: IssueBoardColumns
	recentUnblocks: RecentUnblocks
}

export function IssuesKanbanView({ boardColumns, recentUnblocks }: IssuesKanbanViewProps) {
	const refTime = useNow()
	const { dispatch, isPending } = useDispatchFromQueue()

	const groups = useMemo<Record<IssueState, LaunchQueueItem[]>>(
		() => projectBoardColumns(boardColumns),
		[boardColumns]
	)

	const itemByIdentifier = useMemo(() => {
		const map = new Map<string, Extract<LaunchQueueItem, { kind: 'issue' }>>()
		for (const state of ISSUE_STATE_ORDER) {
			for (const item of groups[state]) {
				if (item.kind === 'issue') map.set(item.issue.identifier, item)
			}
		}
		return map
	}, [groups])

	const { activeIdentifier, sensors, accessibility, onDragStart, onDragEnd, onDragCancel } =
		useIssueKanbanDnd({ groups })

	const activeItem = activeIdentifier ? itemByIdentifier.get(activeIdentifier) : undefined

	return (
		<DndContext
			sensors={sensors}
			accessibility={accessibility}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
			onDragCancel={onDragCancel}
		>
			<div className="board min-h-0 flex-1">
				{ISSUE_STATE_ORDER.map((state) => (
					<KanbanColumn
						key={state}
						state={state}
						items={groups[state]}
						refTime={refTime}
						onDispatch={dispatch}
						dispatchPending={isPending}
						recentUnblocks={recentUnblocks}
						activeDragId={activeIdentifier}
					/>
				))}
			</div>
			<DragOverlay dropAnimation={null}>
				{activeItem ? (
					<KanbanIssueCard
						item={activeItem}
						refTime={refTime}
						onDispatch={dispatch}
						dispatchPending={isPending}
						unblockedAt={undefined}
						dispatchPosition={undefined}
						variant="overlay"
					/>
				) : null}
			</DragOverlay>
		</DndContext>
	)
}
