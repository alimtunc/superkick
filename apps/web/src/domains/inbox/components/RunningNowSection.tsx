import { InboxSectionBody } from '@/domains/inbox/components/InboxSectionBody'
import { RunningNowRow } from '@/domains/inbox/components/RunningNowRow'
import { useOperatorQueue } from '@/hooks/useOperatorQueue'
import type { QueueRunSummary } from '@/types'

export function RunningNowSection() {
	const queue = useOperatorQueue()
	const runs: QueueRunSummary[] = queue.groups['active'] ?? []

	return (
		<InboxSectionBody
			loading={queue.loading}
			error={queue.error}
			emptyMessage="No active runs."
			isEmpty={runs.length === 0}
			skeletonRows={2}
			onRetry={queue.refresh}
		>
			{runs.map((run) => (
				<RunningNowRow key={run.id} run={run} refTime={queue.refTime} />
			))}
		</InboxSectionBody>
	)
}
