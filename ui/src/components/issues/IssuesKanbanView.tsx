import { useMemo } from 'react'

import { KanbanColumn } from '@/components/issues/KanbanColumn'
import { KanbanIssueCard } from '@/components/issues/KanbanIssueCard'
import { CapacityBanner } from '@/components/launch-queue/CapacityBanner'
import { useDispatchFromQueue } from '@/hooks/useDispatchFromQueue'
import { useIssueKanbanDnd } from '@/hooks/useIssueKanbanDnd'
import { useNow } from '@/hooks/useNow'
import { ISSUE_STATE_ORDER, groupItemsByIssueState } from '@/lib/domain'
import type { LaunchQueueActiveCapacity, LaunchQueueItem, RecentUnblocks } from '@/types'
import { DndContext, DragOverlay } from '@dnd-kit/core'

interface IssuesKanbanViewProps {
	queueItems: readonly LaunchQueueItem[]
	activeCapacity: LaunchQueueActiveCapacity
	generatedAt: string | null
	recentUnblocks: RecentUnblocks
}

export function IssuesKanbanView({
	queueItems,
	activeCapacity,
	generatedAt,
	recentUnblocks
}: IssuesKanbanViewProps) {
	const refTime = useNow()
	const { dispatch, isPending } = useDispatchFromQueue()

	const groups = useMemo(() => groupItemsByIssueState(queueItems), [queueItems])

	const itemByIdentifier = useMemo(() => {
		const map = new Map<string, Extract<LaunchQueueItem, { kind: 'issue' }>>()
		for (const item of queueItems) {
			if (item.kind === 'issue') map.set(item.issue.identifier, item)
		}
		return map
	}, [queueItems])

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
			<div className="flex min-h-0 flex-1 flex-col">
				<div className="px-6 pb-3">
					<CapacityBanner capacity={activeCapacity} generatedAt={generatedAt} />
				</div>
				<div className="flex min-h-0 flex-1 items-stretch overflow-x-auto border-t border-border">
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
