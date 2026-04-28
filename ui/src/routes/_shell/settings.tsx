import { RuntimesSection } from '@/components/settings/RuntimesSection'
import { createRoute } from '@tanstack/react-router'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/settings',
	component: SettingsPage
})

function SettingsPage() {
	return (
		<div className="flex flex-1 flex-col gap-6 overflow-y-auto p-8">
			<header>
				<h1 className="font-data text-sm tracking-wider text-silver uppercase">Settings</h1>
				<p className="text-[13px] text-dim">Superkick configuration.</p>
			</header>
			<RuntimesSection />
		</div>
	)
}
