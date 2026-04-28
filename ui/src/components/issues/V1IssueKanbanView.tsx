import { useMemo } from 'react'

import { V1IssueKanbanColumn } from '@/components/issues/V1IssueKanbanColumn'
import { CapacityBanner } from '@/components/launch-queue/CapacityBanner'
import { useDispatchFromQueue } from '@/hooks/useDispatchFromQueue'
import { useNow } from '@/hooks/useNow'
import { V1_STATE_ORDER, groupItemsByV1State } from '@/lib/domain'
import type { LaunchQueueActiveCapacity, LaunchQueueItem, RecentUnblocks } from '@/types'

interface V1IssueKanbanViewProps {
	queueItems: readonly LaunchQueueItem[]
	activeCapacity: LaunchQueueActiveCapacity
	generatedAt: string | null
	recentUnblocks: RecentUnblocks
}

export function V1IssueKanbanView({
	queueItems,
	activeCapacity,
	generatedAt,
	recentUnblocks
}: V1IssueKanbanViewProps) {
	const refTime = useNow()
	const { dispatch, isPending } = useDispatchFromQueue()

	const groups = useMemo(() => groupItemsByV1State(queueItems), [queueItems])

	return (
		<div className="flex flex-col gap-4">
			<CapacityBanner capacity={activeCapacity} generatedAt={generatedAt} />
			<div className="flex gap-3 overflow-x-auto pb-2">
				{V1_STATE_ORDER.map((state) => (
					<V1IssueKanbanColumn
						key={state}
						state={state}
						items={groups[state]}
						refTime={refTime}
						onDispatch={dispatch}
						dispatchPending={isPending}
						recentUnblocks={recentUnblocks}
					/>
				))}
			</div>
		</div>
	)
}
