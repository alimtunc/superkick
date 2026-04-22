import { CapacityBanner } from '@/components/launch-queue/CapacityBanner'
import { LaunchQueueColumn } from '@/components/launch-queue/LaunchQueueColumn'
import { useDispatchFromQueue } from '@/hooks/useDispatchFromQueue'
import { useLaunchQueue } from '@/hooks/useLaunchQueue'
import { useNow } from '@/hooks/useNow'
import { launchQueueQuery } from '@/lib/queries'
import { LAUNCH_QUEUES } from '@/types'
import { createRoute } from '@tanstack/react-router'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/queue',
	loader: ({ context }) => context.queryClient.ensureQueryData(launchQueueQuery()),
	component: LaunchQueuePage
})

function LaunchQueuePage() {
	const { groups, activeCapacity, generatedAt, error, loading } = useLaunchQueue()
	const refTime = useNow()
	const { dispatch, isPending: dispatchPending } = useDispatchFromQueue()

	return (
		<div className="mx-auto flex max-w-360 flex-col gap-6 px-6 py-10">
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

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
				{LAUNCH_QUEUES.map((queue) => (
					<LaunchQueueColumn
						key={queue}
						queue={queue}
						items={groups[queue] ?? []}
						refTime={refTime}
						onDispatch={dispatch}
						dispatchPending={dispatchPending}
					/>
				))}
			</div>
		</div>
	)
}
