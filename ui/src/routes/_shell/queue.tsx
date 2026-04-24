import { CapacityBanner } from '@/components/launch-queue/CapacityBanner'
import { LaunchQueueColumn } from '@/components/launch-queue/LaunchQueueColumn'
import { useDispatchFromQueue } from '@/hooks/useDispatchFromQueue'
import { useLaunchQueue } from '@/hooks/useLaunchQueue'
import { useNow } from '@/hooks/useNow'
import { launchQueueQuery } from '@/lib/queries'
import { ALWAYS_VISIBLE_QUEUES, LAUNCH_QUEUES } from '@/types'
import { createRoute } from '@tanstack/react-router'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/queue',
	loader: ({ context }) => context.queryClient.ensureQueryData(launchQueueQuery()),
	component: LaunchQueuePage
})

function LaunchQueuePage() {
	const { groups, activeCapacity, generatedAt, error, loading, recentUnblocks } = useLaunchQueue()
	const refTime = useNow()
	const { dispatch, isPending: dispatchPending } = useDispatchFromQueue()
	// Anchor columns (Backlog / Todo / Launchable) stay visible even when
	// empty so the operator's eye anchors on the intake side. Everything
	// else collapses out when nothing's there — keeps the Kanban focused
	// on actionable work (SUP-81).
	const visibleQueues = LAUNCH_QUEUES.filter(
		(q) => ALWAYS_VISIBLE_QUEUES.includes(q) || (groups[q]?.length ?? 0) > 0
	)

	return (
		<div className="flex h-full flex-col gap-6 px-6 py-10">
			<div className="flex flex-wrap items-baseline gap-4">
				<h1 className="font-data text-[13px] tracking-widest text-fog uppercase">Launch Queue</h1>
				<p className="font-data text-[11px] text-dim">
					Linear-backed intake: what can we launch, what is blocked, what is running.
				</p>
			</div>

			<CapacityBanner capacity={activeCapacity} generatedAt={generatedAt} />

			{error ? (
				<div className="panel glow-red font-data p-3 text-[12px] text-oxide">{error}</div>
			) : null}

			{loading ? (
				<p className="font-data py-6 text-center text-[11px] text-dim">Loading queue…</p>
			) : null}

			{/* Kanban-style horizontal scroll: every bucket renders as a fixed-
			    width column. Avoids per-breakpoint stacking so the operator
			    always reads the workflow left-to-right (Backlog → Done).
			    `min-h-0` lets each column own its own internal scroll without
			    the parent stretching. */}
			<div className="flex min-h-0 flex-1 gap-4 overflow-x-auto pb-2">
				{visibleQueues.map((queue) => (
					<div key={queue} className="w-72 shrink-0">
						<LaunchQueueColumn
							queue={queue}
							items={groups[queue] ?? []}
							refTime={refTime}
							onDispatch={dispatch}
							dispatchPending={dispatchPending}
							recentUnblocks={recentUnblocks}
						/>
					</div>
				))}
			</div>
		</div>
	)
}
