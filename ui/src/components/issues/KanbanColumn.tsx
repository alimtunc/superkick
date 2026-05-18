import { KanbanCard } from '@/components/issues/KanbanCard'
import { EmptyState } from '@/components/ui/state-empty'
import { issueStateAccent, issueStateTone } from '@/lib/domain'
import type { IssueState, LaunchQueueItem, RecentUnblocks } from '@/types'
import { Dot } from '@/ui/Dot'

interface KanbanColumnProps {
	state: IssueState
	items: LaunchQueueItem[]
	refTime: number
	onDispatch: (issueIdentifier: string) => void
	dispatchPending: boolean
	recentUnblocks: RecentUnblocks
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
	recentUnblocks
}: KanbanColumnProps) {
	const accent = issueStateAccent[state]
	const dispatchPositions = dispatchPositionsFor(items)

	return (
		<div className="flex w-65 shrink-0 flex-col border-r border-border last:border-r-0">
			<div className="flex items-center gap-2 px-3.5 pt-3 pb-2.5">
				<Dot tone={issueStateTone[state]} size={8} />
				<span className="text-[12px] font-semibold text-fg">{accent.label}</span>
				<span className="font-mono text-[11px] text-fg-dim">{items.length}</span>
			</div>
			{items.length === 0 ? (
				<div className="px-3.5 pb-3.5">
					<EmptyState density="compact" title="Empty" />
				</div>
			) : (
				<div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3.5 pb-3.5">
					{items.map((item, index) => (
						<KanbanCard
							key={keyForItem(item)}
							item={item}
							refTime={refTime}
							onDispatch={onDispatch}
							dispatchPending={dispatchPending}
							unblockedAt={unblockedAtFor(item, recentUnblocks)}
							dispatchPosition={dispatchPositions[index]}
						/>
					))}
				</div>
			)}
		</div>
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
