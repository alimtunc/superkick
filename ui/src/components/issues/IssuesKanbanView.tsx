import { useMemo } from 'react'

import { KanbanColumn } from '@/components/issues/KanbanColumn'
import { CapacityBanner } from '@/components/launch-queue/CapacityBanner'
import { useDispatchFromQueue } from '@/hooks/useDispatchFromQueue'
import { useNow } from '@/hooks/useNow'
import { ISSUE_STATE_ORDER, groupItemsByIssueState } from '@/lib/domain'
import type { LaunchQueueActiveCapacity, LaunchQueueItem, RecentUnblocks } from '@/types'

interface IssuesKanbanViewProps {
	queueItems: readonly LaunchQueueItem[]
	activeCapacity: LaunchQueueActiveCapacity
	generatedAt: string | null
	recentUnblocks: RecentUnblocks
}

export function IssuesKanbanView({
	queueItems,
	activeCapacity,
	generatedAt,
	recentUnblocks
}: IssuesKanbanViewProps) {
	const refTime = useNow()
	const { dispatch, isPending } = useDispatchFromQueue()

	const groups = useMemo(() => groupItemsByIssueState(queueItems), [queueItems])

	return (
		<div className="flex flex-col gap-4">
			<CapacityBanner capacity={activeCapacity} generatedAt={generatedAt} />
			<div className="flex gap-3 overflow-x-auto pb-2">
				{ISSUE_STATE_ORDER.map((state) => (
					<KanbanColumn
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
