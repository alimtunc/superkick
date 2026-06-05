import { useMemo, useState } from 'react'

import { SETTINGS_NAV_ITEMS } from '@/components/settings/settingsNav'
import { SettingsPaneComingSoon } from '@/components/settings/SettingsPaneComingSoon'
import { SettingsPaneGeneral } from '@/components/settings/SettingsPaneGeneral'
import { SettingsPaneProfiles } from '@/components/settings/SettingsPaneProfiles'
import { SettingsPaneProviders } from '@/components/settings/SettingsPaneProviders'
import { SettingsPaneRules } from '@/components/settings/SettingsPaneRules'
import { SettingsPaneRuntimes } from '@/components/settings/SettingsPaneRuntimes'
import { SettingsPaneSkills } from '@/components/settings/SettingsPaneSkills'
import { SettingsShell } from '@/components/settings/SettingsShell'
import { usePageActions } from '@/shell/usePageActions'
import type { SettingsPaneId } from '@/types'
import { createRoute } from '@tanstack/react-router'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/settings',
	component: SettingsPage
})

function SettingsPage() {
	const [active, setActive] = useState<SettingsPaneId>('general')
	const activeLabel = SETTINGS_NAV_ITEMS.find((item) => item.id === active)?.label ?? 'Settings'

	usePageActions({
		title: useMemo(
			() => (
				<>
					Settings <span className="text-fg-dim">·</span> {activeLabel}
				</>
			),
			[activeLabel]
		)
	})

	return (
		<SettingsShell activeId={active} onSelect={setActive}>
			{renderPane(active, activeLabel)}
		</SettingsShell>
	)
}

function renderPane(id: SettingsPaneId, label: string) {
	if (id === 'general') return <SettingsPaneGeneral />
	if (id === 'providers') return <SettingsPaneProviders />
	if (id === 'skills') return <SettingsPaneSkills />
	if (id === 'profiles') return <SettingsPaneProfiles />
	if (id === 'rules') return <SettingsPaneRules />
	if (id === 'runtimes') return <SettingsPaneRuntimes />
	return <SettingsPaneComingSoon label={label} />
}
