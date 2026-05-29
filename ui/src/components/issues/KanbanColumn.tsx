import { useState } from 'react'

import { KanbanCard } from '@/components/issues/KanbanCard'
import { EmptyState } from '@/components/ui/state-empty'
import {
	isDroppableIssueState,
	issueStateAccent,
	issueStateTone,
	launchQueueItemIdentifier
} from '@/lib/domain'
import { cn } from '@/lib/utils'
import type { IssueState, LaunchQueueItem, RecentUnblocks } from '@/types'
import { Dot } from '@/ui/Dot'
import { useDroppable } from '@dnd-kit/core'

const DONE_COLLAPSED_COUNT = 2

interface KanbanColumnProps {
	state: IssueState
	items: LaunchQueueItem[]
	refTime: number
	onDispatch: (issueIdentifier: string) => void
	dispatchPending: boolean
	recentUnblocks: RecentUnblocks
	/** Identifier of the currently-dragged card; drives the ghost placeholder in the target column. */
	activeDragId: string | null
}

function dispatchPositionsFor(items: LaunchQueueItem[]): readonly (number | undefined)[] {
	let next = 0
	return items.map((item) => {
		if (item.bucket !== 'launchable') return undefined
		next += 1
		return next
	})
}

export function KanbanColumn({
	state,
	items,
	refTime,
	onDispatch,
	dispatchPending,
	recentUnblocks,
	activeDragId
}: KanbanColumnProps) {
	const [showAllDone, setShowAllDone] = useState(false)
	const accent = issueStateAccent[state]
	const dispatchPositions = dispatchPositionsFor(items)
	const droppable = isDroppableIssueState(state)
	const pinned = state === 'needs_human'
	const collapseDone = state === 'done' && !showAllDone && items.length > DONE_COLLAPSED_COUNT
	const visibleItems = collapseDone ? items.slice(0, DONE_COLLAPSED_COUNT) : items
	const hiddenDoneCount = items.length - visibleItems.length
	const { setNodeRef, isOver } = useDroppable({
		id: state,
		data: { droppable }
	})

	const hasGhost =
		isOver &&
		activeDragId !== null &&
		!items.some((item) => launchQueueItemIdentifier(item) === activeDragId)

	return (
		<div
			ref={setNodeRef}
			data-issue-state={state}
			className={cn(
				'flex w-67 shrink-0 flex-col border-r border-border transition-colors duration-150 last:border-r-0 motion-reduce:transition-none',
				pinned
					? 'border-t border-t-[color-mix(in_srgb,var(--color-warn)_25%,var(--color-border))]'
					: null,
				isOver && droppable ? 'bg-accent-soft' : null,
				isOver && !droppable ? 'bg-danger-soft' : null
			)}
		>
			<div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
				<Dot tone={issueStateTone[state]} size={8} />
				<span className={cn('text-[12.5px] font-semibold', pinned ? 'text-warn' : 'text-fg')}>
					{accent.label}
				</span>
				<span className="font-mono text-[11px] text-fg-dim">{items.length}</span>
			</div>
			{items.length === 0 && !hasGhost ? (
				<div className="px-3.5 pb-3.5">
					<EmptyState density="compact" title="Empty" />
				</div>
			) : (
				<div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3.5 pb-3.5">
					{hasGhost ? <DropGhost /> : null}
					{visibleItems.map((item, index) => (
						<KanbanCard
							key={keyForItem(item)}
							item={item}
							state={state}
							refTime={refTime}
							onDispatch={onDispatch}
							dispatchPending={dispatchPending}
							unblockedAt={unblockedAtFor(item, recentUnblocks)}
							dispatchPosition={dispatchPositions[index]}
						/>
					))}
					{hiddenDoneCount > 0 ? (
						<button
							type="button"
							onClick={() => setShowAllDone(true)}
							className="py-2 text-center text-[11.5px] text-fg-dim"
						>
							Show all <span className="text-accent">{items.length} →</span>
						</button>
					) : null}
				</div>
			)}
		</div>
	)
}

function DropGhost() {
	return (
		<div
			aria-hidden="true"
			className="h-24 rounded-lg border border-dashed border-border-strong opacity-65"
		/>
	)
}

function unblockedAtFor(item: LaunchQueueItem, recentUnblocks: RecentUnblocks): string | undefined {
	if (item.kind !== 'issue') return undefined
	return recentUnblocks[item.issue.id]
}

function keyForItem(item: LaunchQueueItem): string {
	if (item.kind === 'issue') return `issue:${item.issue.id}`
	return `run:${item.run.id}`
}
