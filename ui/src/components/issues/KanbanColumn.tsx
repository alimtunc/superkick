import { type CSSProperties, useState } from 'react'

import { KanbanCard } from '@/components/issues/KanbanCard'
import { EmptyState } from '@/components/ui/state-empty'
import { isDroppableIssueState, issueStateAccent, launchQueueItemIdentifier } from '@/lib/domain'
import { cn } from '@/lib/utils'
import type { IssueState, LaunchQueueItem, RecentUnblocks, StatusIconKind } from '@/types'
import { Btn, StatusIcon } from '@/ui'
import { useDroppable } from '@dnd-kit/core'

const DONE_COLLAPSED_COUNT = 2

const EMPTY_COLUMN_STYLE: CSSProperties = { width: 160 }

const STATE_STATUS_KIND: Record<IssueState, StatusIconKind> = {
	needs_human: 'needs',
	backlog: 'backlog',
	todo: 'todo',
	in_progress: 'progress',
	in_review: 'review',
	done: 'done'
}

interface KanbanColumnProps {
	state: IssueState
	items: LaunchQueueItem[]
	refTime: number
	onDispatch: (issueIdentifier: string) => void
	dispatchPending: boolean
	recentUnblocks: RecentUnblocks
	/** Identifier of the currently-dragged card; drives the ghost placeholder in the target column. */
	activeDragId: string | null
	/** Render the header "+" button only when provided. */
	onCreateIssue?: () => void
	/** Disable droppable wiring + drop ghost (board uses static columns). */
	enableDnd?: boolean
	/** Header label override; falls back to `issueStateAccent[state].label`. */
	label?: string
	/** Header status glyph override; falls back to `STATE_STATUS_KIND[state]`. */
	statusKind?: StatusIconKind
	/** Force run-card rendering regardless of the feature flag. */
	forceRunCards?: boolean
	/** Collapse threshold for "done"-style columns; falls back to the issue default. */
	collapseDoneCount?: number
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
	activeDragId,
	onCreateIssue,
	enableDnd = true,
	label,
	statusKind,
	forceRunCards,
	collapseDoneCount = DONE_COLLAPSED_COUNT
}: KanbanColumnProps) {
	const [showAllDone, setShowAllDone] = useState(false)
	const accent = issueStateAccent[state]
	const headerLabel = label ?? accent.label
	const headerKind = statusKind ?? STATE_STATUS_KIND[state]
	const dispatchPositions = dispatchPositionsFor(items)
	const droppable = isDroppableIssueState(state)
	const collapseDone = state === 'done' && !showAllDone && items.length > collapseDoneCount
	const visibleItems = collapseDone ? items.slice(0, collapseDoneCount) : items
	const hiddenDoneCount = items.length - visibleItems.length
	const { setNodeRef, isOver } = useDroppable({
		id: state,
		data: { droppable }
	})

	const hasGhost =
		enableDnd &&
		isOver &&
		activeDragId !== null &&
		!items.some((item) => launchQueueItemIdentifier(item) === activeDragId)

	const isEmpty = items.length === 0 && !hasGhost

	return (
		<div
			ref={enableDnd ? setNodeRef : undefined}
			data-issue-state={state}
			style={isEmpty ? EMPTY_COLUMN_STYLE : undefined}
			className={cn(
				'column transition-[width,background-color] duration-150 motion-reduce:transition-none',
				enableDnd && isOver && droppable ? 'bg-accent-soft' : null,
				enableDnd && isOver && !droppable ? 'bg-danger-soft' : null
			)}
		>
			<div className="column__head">
				<StatusIcon kind={headerKind} size={14} />
				<span className="column__name">{headerLabel}</span>
				<span className="column__count">{items.length}</span>
				{onCreateIssue ? (
					<Btn
						kind="ghost"
						icon="plus"
						className="column__add"
						aria-label={`New ${headerLabel} issue`}
						onClick={onCreateIssue}
					/>
				) : null}
			</div>
			{isEmpty ? (
				<div className="column__cards">
					<EmptyState density="compact" title="Empty" />
				</div>
			) : (
				<div className="column__cards">
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
							forceRunCards={forceRunCards}
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
