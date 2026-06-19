import { RunInspectorPage } from '@/domains/runs/components/run-inspector/RunInspectorPage'
import { useNow } from '@/hooks/useNow'
import { runDetailQuery } from '@/lib/queries'
import { createRoute, useParams } from '@tanstack/react-router'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/runs/$runId',
	loader: ({ context, params }) => {
		void context.queryClient.prefetchQuery(runDetailQuery(params.runId))
	},
	component: RunDetailPage
})

function RunDetailPage() {
	const { runId } = useParams({ from: '/_shell/runs/$runId' })
	const refTime = useNow()

	return (
		<div className="h-full overflow-hidden">
			<RunInspectorPage key={runId} runId={runId} refTime={refTime} />
		</div>
	)
}
