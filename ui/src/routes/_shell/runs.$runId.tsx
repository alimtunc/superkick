import { RunDetailView } from '@/components/run-detail/RunDetailView'
import { useNow } from '@/hooks/useNow'
import { runDetailQuery } from '@/lib/queries'
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
	const refTime = useNow()

	return <RunDetailView key={runId} runId={runId} refTime={refTime} />
}
