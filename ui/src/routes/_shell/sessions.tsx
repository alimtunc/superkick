import { createRoute } from '@tanstack/react-router'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/sessions',
	component: SessionsPage
})

function SessionsPage() {
	return (
		<div className="flex flex-1 items-center justify-center p-10">
			<div className="text-center">
				<h1 className="font-data mb-2 text-sm tracking-wider text-silver uppercase">Sessions</h1>
				<p className="text-[13px] text-dim">Session monitoring and history.</p>
			</div>
		</div>
	)
}
