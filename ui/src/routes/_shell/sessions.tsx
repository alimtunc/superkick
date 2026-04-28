import { EmptyState } from '@/components/ui/state-empty'
import { createRoute } from '@tanstack/react-router'
import { Activity } from 'lucide-react'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/sessions',
	component: SessionsPage
})

function SessionsPage() {
	return (
		<div className="mx-auto max-w-3xl px-5 py-12">
			<EmptyState
				icon={Activity}
				title="Sessions"
				description="Session monitoring and history will surface here."
			/>
		</div>
	)
}
