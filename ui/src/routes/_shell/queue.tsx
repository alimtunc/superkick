import { CapacityBanner } from '@/components/launch-queue/CapacityBanner'
import { LaunchQueueColumn } from '@/components/launch-queue/LaunchQueueColumn'
import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
import { useDispatchFromQueue } from '@/hooks/useDispatchFromQueue'
import { useLaunchQueue } from '@/hooks/useLaunchQueue'
import { useNow } from '@/hooks/useNow'
import { launchQueueQuery } from '@/lib/queries'
import { usePageActions } from '@/shell/usePageActions'
import { ALWAYS_VISIBLE_QUEUES, LAUNCH_QUEUES } from '@/types'
import { createRoute } from '@tanstack/react-router'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/queue',
	loader: ({ context }) => {
		void context.queryClient.prefetchQuery(launchQueueQuery())
	},
	component: LaunchQueuePage
})

function LaunchQueuePage() {
	const { groups, activeCapacity, generatedAt, error, loading, recentUnblocks } = useLaunchQueue()
	const refTime = useNow()
	const { dispatch, isPending: dispatchPending } = useDispatchFromQueue()
	usePageActions({ title: 'Launch Queue' })
	// Anchor columns stay visible even when empty; everything else collapses out when it has no items.
	const visibleQueues = LAUNCH_QUEUES.filter(
		(q) => ALWAYS_VISIBLE_QUEUES.includes(q) || (groups[q]?.length ?? 0) > 0
	)

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="px-6 pt-4 pb-3">
				<CapacityBanner capacity={activeCapacity} generatedAt={generatedAt} />
			</div>

			{error ? (
				<div className="px-6 py-4">
					<ErrorState message={error} density="compact" />
				</div>
			) : null}

			{loading ? (
				<div className="px-6 py-4">
					<LoadingState rows={4} />
				</div>
			) : null}

			<div className="flex min-h-0 flex-1 items-stretch overflow-x-auto border-t border-border">
				{visibleQueues.map((queue) => (
					<LaunchQueueColumn
						key={queue}
						queue={queue}
						items={groups[queue] ?? []}
						refTime={refTime}
						onDispatch={dispatch}
						dispatchPending={dispatchPending}
						recentUnblocks={recentUnblocks}
					/>
				))}
			</div>
		</div>
	)
}
