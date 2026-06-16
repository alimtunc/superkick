import { useMemo } from 'react'

import { EmptyState, ErrorState, LoadingState } from '@/components/primitives'
import { BoardHeader } from '@/domains/dashboard/components/board/BoardHeader'
import { PhaseBoard } from '@/domains/dashboard/components/board/PhaseBoard'
import { useOperatorQueue } from '@/hooks/useOperatorQueue'
import { toPhaseColumns } from '@/lib/domain'
import { dashboardQueueQuery } from '@/lib/queries'
import { createRoute } from '@tanstack/react-router'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/board',
	loader: ({ context }) => {
		void context.queryClient.prefetchQuery(dashboardQueueQuery())
	},
	component: BoardPage
})

function BoardPage() {
	const queue = useOperatorQueue()
	const columns = useMemo(() => toPhaseColumns(queue.groups), [queue.groups])

	const liveColumns = columns.filter((c) => c.phase !== 'done')
	const openCount = liveColumns.reduce((n, c) => n + c.cards.length, 0)
	const needsHumanCount = liveColumns.reduce(
		(n, c) => n + c.cards.filter((card) => card.needsYou).length,
		0
	)
	const total = columns.reduce((n, c) => n + c.cards.length, 0)
	const lastRefresh = queue.generatedAt ? new Date(queue.generatedAt).getTime() : null

	return (
		<div className="flex h-full min-h-0 flex-col">
			<BoardHeader
				openCount={openCount}
				needsHumanCount={needsHumanCount}
				loading={queue.loading}
				lastRefresh={lastRefresh}
				onRefresh={queue.refresh}
			/>

			<div className="flex min-h-0 flex-1 flex-col">
				{queue.error ? (
					<div className="px-6 py-4">
						<ErrorState message={queue.error} onRetry={queue.refresh} density="compact" />
					</div>
				) : null}

				{queue.loading && total === 0 ? (
					<div className="px-6 py-4">
						<LoadingState rows={5} />
					</div>
				) : null}

				{!queue.loading && total === 0 ? (
					<EmptyState title="No launched work." description="Start one from an issue." />
				) : null}

				{total > 0 ? <PhaseBoard columns={columns} refTime={queue.refTime} /> : null}
			</div>
		</div>
	)
}
