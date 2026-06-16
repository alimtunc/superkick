import { SettingsPaneSkills } from '@/domains/settings/components/SettingsPaneSkills'
import { skillsQuery } from '@/lib/queries'
import { createRoute } from '@tanstack/react-router'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/skills',
	loader: ({ context }) => {
		void context.queryClient.prefetchQuery(skillsQuery())
	},
	component: SkillsPage
})

function SkillsPage() {
	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="mx-auto w-full max-w-280 flex-1 overflow-y-auto p-5">
				<SettingsPaneSkills />
			</div>
		</div>
	)
}
