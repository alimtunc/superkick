import { EmptyState } from '@/components/ui/state-empty'
import { createRoute } from '@tanstack/react-router'
import { Bot } from 'lucide-react'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/agents',
	component: AgentsPage
})

function AgentsPage() {
	return (
		<div className="mx-auto max-w-3xl px-5 py-12">
			<EmptyState
				icon={Bot}
				title="Agents"
				description="Configured agents, roles and policies will surface here."
			/>
		</div>
	)
}
