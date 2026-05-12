import { InboxSection } from '@/components/inbox/InboxSection'
import { ReadyToLaunchSection } from '@/components/inbox/ReadyToLaunchSection'
import { RecentlyDoneSection } from '@/components/inbox/RecentlyDoneSection'
import { RunningNowSection } from '@/components/inbox/RunningNowSection'
import { useLaunchQueue } from '@/hooks/useLaunchQueue'
import { useOperatorQueue } from '@/hooks/useOperatorQueue'
import { useRecentlyDoneEntries } from '@/hooks/useRecentlyDoneEntries'

function safeCount(...counts: ReadonlyArray<number | undefined>): number {
	return counts.reduce<number>((acc, value) => acc + (value ?? 0), 0)
}

export function UpdatesWorthALookSection() {
	const queue = useOperatorQueue()
	const launchQueue = useLaunchQueue()
	const done = useRecentlyDoneEntries()

	const loading = queue.loading || launchQueue.loading || done.loading
	const total = safeCount(
		queue.groups['active']?.length,
		launchQueue.groups['launchable']?.length,
		done.entries.length
	)

	return (
		<InboxSection title="Updates worth a look" count={loading ? null : total}>
			<RunningNowSection />
			<ReadyToLaunchSection />
			<RecentlyDoneSection />
		</InboxSection>
	)
}
