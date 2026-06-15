import { AgentCockpit } from '@/components/agents/AgentCockpit'
import { managedAgentQuery } from '@/lib/queries'
import { createRoute, useParams } from '@tanstack/react-router'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/agents/$agentId',
	loader: ({ context, params }) => {
		void context.queryClient.prefetchQuery(managedAgentQuery(params.agentId))
	},
	component: AgentDetailPage
})

function AgentDetailPage() {
	const { agentId } = useParams({ from: '/_shell/agents/$agentId' })
	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="mx-auto w-full max-w-280 flex-1 overflow-y-auto p-5">
				<AgentCockpit name={agentId} />
			</div>
		</div>
	)
}
