import { LaunchQueueCard } from '@/components/launch-queue/LaunchQueueCard'
import { launchQueueAccent } from '@/lib/domain'
import type { LaunchQueue, LaunchQueueItem, RecentUnblocks } from '@/types'

interface LaunchQueueColumnProps {
	queue: LaunchQueue
	items: LaunchQueueItem[]
	refTime: number
	onDispatch: (issueIdentifier: string) => void
	dispatchPending: boolean
	/** downstream_issue_id → ISO resolved_at for recently-unblocked items
	 *  (SUP-81). Consumed via `unblockedAt` lookup on each issue card. */
	recentUnblocks: RecentUnblocks
}

export function LaunchQueueColumn({
	queue,
	items,
	refTime,
	onDispatch,
	dispatchPending,
	recentUnblocks
}: LaunchQueueColumnProps) {
	const accent = launchQueueAccent[queue]
	const Icon = accent.icon
	return (
		<div className={`panel flex max-h-[70vh] flex-col overflow-hidden border-t-2 ${accent.border}`}>
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
						<LaunchQueueCard
							key={keyForItem(item)}
							item={item}
							refTime={refTime}
							onDispatch={onDispatch}
							dispatchPending={dispatchPending}
							unblockedAt={unblockedAtFor(item, recentUnblocks)}
							dispatchPosition={queue === 'launchable' ? index + 1 : undefined}
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
