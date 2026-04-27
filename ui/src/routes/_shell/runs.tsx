import { useMemo } from 'react'

import { RunGroup } from '@/components/runs/RunGroup'
import { RunsHeader } from '@/components/runs/RunsHeader'
import { useOperatorQueue } from '@/hooks/useOperatorQueue'
import { toRunGroups } from '@/lib/domain'
import { dashboardQueueQuery } from '@/lib/queries'
import { createRoute } from '@tanstack/react-router'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/runs',
	loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQueueQuery()),
	component: RunsPage
})

function RunsPage() {
	const queue = useOperatorQueue()
	const groups = useMemo(() => toRunGroups(queue.groups), [queue.groups])
	const openCount = groups.active.length + groups.needsHuman.length + groups.inReview.length
	const total = openCount + groups.recent.length
	const lastRefresh = queue.generatedAt ? new Date(queue.generatedAt).getTime() : null

	return (
		<div className="flex h-full min-h-0 flex-col">
			<RunsHeader
				openCount={openCount}
				needsHumanCount={groups.needsHuman.length}
				loading={queue.loading}
				lastRefresh={lastRefresh}
				onRefresh={queue.refresh}
			/>

			<div className="mx-auto flex min-h-0 w-full max-w-360 flex-1 flex-col gap-4 px-5 py-5">
				{queue.error ? <p className="font-data text-[11px] text-oxide">{queue.error}</p> : null}

				{queue.loading && total === 0 ? (
					<p className="font-data py-10 text-center text-dim">Loading runs...</p>
				) : null}

				{!queue.loading && total === 0 ? (
					<p className="font-data py-10 text-center text-dim">
						No runs yet. Start one from an issue.
					</p>
				) : null}

				{total > 0 ? (
					<div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
						<RunGroup
							id="active"
							tone="cyan"
							label="Active"
							description="In flight — no operator signal needed."
							runs={groups.active}
							refTime={queue.refTime}
							cardVariant="default"
							emptyLabel="Nothing in flight."
						/>
						<RunGroup
							id="needs-human"
							tone="oxide"
							label="Needs Human"
							description="Attention requested, paused, or blocked — act now."
							runs={groups.needsHuman}
							refTime={queue.refTime}
							cardVariant="respond"
							emptyLabel="All clear — nothing needs you right now."
						/>
						<RunGroup
							id="in-review"
							tone="violet"
							label="In Review"
							description="Pull request open or draft — review or merge."
							runs={groups.inReview}
							refTime={queue.refTime}
							cardVariant="default"
							emptyLabel="No PRs awaiting review."
						/>
						<RunGroup
							id="recent"
							tone="mineral"
							label="Recent"
							description="Last 20 completed runs."
							runs={groups.recent}
							refTime={queue.refTime}
							cardVariant="default"
							emptyLabel="No completed runs yet."
						/>
					</div>
				) : null}
			</div>
		</div>
	)
}
