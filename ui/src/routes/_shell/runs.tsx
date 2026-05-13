import { useMemo } from 'react'

import { RunGroup } from '@/components/runs/RunGroup'
import { RunsHeader } from '@/components/runs/RunsHeader'
import { EmptyState } from '@/components/ui/state-empty'
import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
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

			<div className="mx-auto flex min-h-0 w-full max-w-360 flex-1 flex-col gap-4 p-5">
				{queue.error ? (
					<ErrorState message={queue.error} onRetry={queue.refresh} density="compact" />
				) : null}

				{queue.loading && total === 0 ? <LoadingState rows={5} /> : null}

				{!queue.loading && total === 0 ? (
					<EmptyState title="No runs yet." description="Start one from an issue." />
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
