import { KanbanCard } from '@/components/issues/KanbanCard'
import { EmptyState } from '@/components/ui/state-empty'
import { issueStateAccent } from '@/lib/domain'
import type { IssueState, LaunchQueueItem, RecentUnblocks } from '@/types'

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
	const Icon = accent.icon
	const dispatchPositions = dispatchPositionsFor(items)

	return (
		<div
			className={`flex max-h-[70vh] min-w-72 flex-col overflow-hidden rounded-md border border-t-2 border-edge bg-graphite ${accent.border}`}
		>
			<div className="flex items-start justify-between gap-2 border-b border-edge px-3 py-2">
				<div className="min-w-0">
					<p
						className={`font-data flex items-center gap-1.5 text-[10px] tracking-wider uppercase ${accent.text}`}
					>
						<Icon size={11} strokeWidth={1.75} aria-hidden="true" />
						{accent.label}
					</p>
					<p className="font-data mt-0.5 truncate text-[10px] text-ash">{accent.description}</p>
				</div>
				<span className="font-data shrink-0 text-[11px] text-ash">{items.length}</span>
			</div>
			{items.length === 0 ? (
				<div className="p-2">
					<EmptyState density="compact" title="Empty" />
				</div>
			) : (
				<div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-1.5">
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
