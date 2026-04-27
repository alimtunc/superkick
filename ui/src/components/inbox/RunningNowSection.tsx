import { InboxSection } from '@/components/inbox/InboxSection'
import { InboxSectionBody } from '@/components/inbox/InboxSectionBody'
import { RunningNowRow } from '@/components/inbox/RunningNowRow'
import { useOperatorQueue } from '@/hooks/useOperatorQueue'
import type { QueueRunSummary } from '@/types'

export function RunningNowSection() {
	const queue = useOperatorQueue()
	const runs: QueueRunSummary[] = queue.groups['active'] ?? []

	return (
		<InboxSection title="Running Now" count={queue.loading ? null : runs.length}>
			<InboxSectionBody
				loading={queue.loading}
				error={queue.error}
				emptyMessage="No active runs. Dispatched work will appear here while it's executing."
				isEmpty={runs.length === 0}
				skeletonRows={3}
				onRetry={queue.refresh}
			>
				<div className="divide-y divide-edge/50 overflow-hidden rounded border border-edge">
					{runs.map((run) => (
						<RunningNowRow key={run.id} run={run} refTime={queue.refTime} />
					))}
				</div>
			</InboxSectionBody>
		</InboxSection>
	)
}
