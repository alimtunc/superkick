import { useMemo } from 'react'

import { KanbanCard } from '@/components/issues/KanbanCard'
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

	const dispatchPositions: readonly (number | undefined)[] = useMemo(() => {
		let next = 0
		return items.map((item) => {
			if (item.bucket !== 'launchable') return undefined
			next += 1
			return next
		})
	}, [items])

	return (
		<div
			className={`panel flex max-h-[70vh] min-w-72 flex-col overflow-hidden border-t-2 ${accent.border}`}
		>
			<div className="flex items-start justify-between gap-2 border-b border-edge px-3 py-2">
				<div className="min-w-0">
					<p
						className={`font-data flex items-center gap-1.5 text-[10px] tracking-wider uppercase ${accent.text}`}
					>
						<Icon size={11} aria-hidden="true" />
						{accent.label}
					</p>
					<p className="font-data mt-0.5 truncate text-[10px] text-dim">{accent.description}</p>
				</div>
				<span className="font-data shrink-0 text-[11px] text-ash">{items.length}</span>
			</div>
			{items.length === 0 ? (
				<p className="font-data px-3 py-4 text-[11px] text-dim">Empty</p>
			) : (
				<div className="flex-1 divide-y divide-edge/50 overflow-y-auto">
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
