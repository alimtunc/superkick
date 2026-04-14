import { createRoute } from '@tanstack/react-router'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/attention',
	component: AttentionPage
})

function AttentionPage() {
	return (
		<div className="flex flex-1 items-center justify-center p-10">
			<div className="text-center">
				<h1 className="font-data mb-2 text-sm tracking-wider text-silver uppercase">Attention</h1>
				<p className="text-[13px] text-dim">Items requiring human intervention.</p>
			</div>
		</div>
	)
}
