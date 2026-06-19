import { AgentRoster } from '@/domains/agents/components/AgentRoster'
import { agentsQuery } from '@/lib/queries'
import { createRoute } from '@tanstack/react-router'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/agents',
	loader: ({ context }) => {
		void context.queryClient.prefetchQuery(agentsQuery())
	},
	component: AgentsPage
})

function AgentsPage() {
	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="mx-auto w-full max-w-280 flex-1 overflow-y-auto p-5">
				<AgentRoster />
			</div>
		</div>
	)
}
