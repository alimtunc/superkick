import { Dot, EmptyState } from '@/components/primitives'
import { LaunchQueueCard } from '@/domains/launch/components/launch-queue/LaunchQueueCard'
import { launchQueueAccent } from '@/lib/domain'
import type { LaunchQueue, LaunchQueueItem, RecentUnblocks } from '@/types'

interface LaunchQueueColumnProps {
	queue: LaunchQueue
	items: LaunchQueueItem[]
	refTime: number
	onDispatch: (issueIdentifier: string) => void
	dispatchPending: boolean
	/** downstream_issue_id → ISO resolved_at for recently-unblocked items
	 * . Consumed via `unblockedAt` lookup on each issue card. */
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
			className="column border-r border-border last:border-r-0"
			style={{ width: '260px' }}
			title={accent.description}
		>
			<div className="column__head">
				<Dot tone={accent.tone} size={8} />
				<span className="column__name">{accent.label}</span>
				<span className="column__count">{items.length}</span>
			</div>
			{items.length === 0 ? (
				<div className="px-3.5 pb-3.5">
					<EmptyState density="compact" title="Empty" />
				</div>
			) : (
				<div className="column__cards flex-1 px-3.5 pb-3.5">
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
