import { EmptyState } from '@/components/ui/state-empty'
import { createRoute } from '@tanstack/react-router'
import { Bell } from 'lucide-react'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/attention',
	component: AttentionPage
})

function AttentionPage() {
	return (
		<div className="mx-auto max-w-3xl px-5 py-12">
			<EmptyState
				icon={Bell}
				title="Attention"
				description="Items requiring human intervention will surface here."
			/>
		</div>
	)
}
