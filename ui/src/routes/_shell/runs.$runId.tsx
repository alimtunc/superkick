import { RunDetailView } from '@/components/run-detail/RunDetailView'
import { runDetailQuery } from '@/lib/queries'
import { queryKeys } from '@/lib/queryKeys'
import { useQueryClient } from '@tanstack/react-query'
import { createRoute, useParams } from '@tanstack/react-router'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/runs/$runId',
	loader: ({ context, params }) => context.queryClient.ensureQueryData(runDetailQuery(params.runId)),
	component: RunDetailPage
})

function RunDetailPage() {
	const { runId } = useParams({ from: '/_shell/runs/$runId' })
	const queryClient = useQueryClient()
	const refTime = queryClient.getQueryState(queryKeys.runs.detail(runId))?.dataUpdatedAt || Date.now()

	return <RunDetailView key={runId} runId={runId} refTime={refTime} />
}
