import { LaunchQueueCard } from '@/components/launch-queue/LaunchQueueCard'
import { EmptyState } from '@/components/ui/state-empty'
import { launchQueueAccent } from '@/lib/domain'
import type { LaunchQueue, LaunchQueueItem, RecentUnblocks } from '@/types'
import { Dot } from '@/ui/Dot'

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
	return (
		<div
			className="flex w-65 shrink-0 flex-col border-r border-border last:border-r-0"
			title={accent.description}
		>
			<div className="flex items-center gap-2 px-3.5 pt-3 pb-2.5">
				<Dot tone={accent.tone} size={8} />
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
