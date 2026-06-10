import { SettingsLayout } from '@/components/settings/SettingsLayout'
import { isSettingsPaneId, SETTINGS_NAV_ITEMS } from '@/components/settings/settingsNav'
import { SettingsPaneComingSoon } from '@/components/settings/SettingsPaneComingSoon'
import { SettingsPaneGeneral } from '@/components/settings/SettingsPaneGeneral'
import { SettingsPaneIntegrations } from '@/components/settings/SettingsPaneIntegrations'
import { SettingsPaneProfiles } from '@/components/settings/SettingsPaneProfiles'
import { SettingsPaneProviders } from '@/components/settings/SettingsPaneProviders'
import { SettingsPaneRules } from '@/components/settings/SettingsPaneRules'
import { SettingsPaneRuntimes } from '@/components/settings/SettingsPaneRuntimes'
import { SettingsPaneSkills } from '@/components/settings/SettingsPaneSkills'
import type { SettingsPaneId } from '@/types'
import { createRoute, type SearchSchemaInput } from '@tanstack/react-router'

import { Route as rootRoute } from './__root'

interface SettingsSearch {
	pane: SettingsPaneId
}

export const Route = createRoute({
	getParentRoute: () => rootRoute,
	path: '/settings',
	validateSearch: (raw: Partial<SettingsSearch> & SearchSchemaInput): SettingsSearch => ({
		pane: isSettingsPaneId(raw.pane) ? raw.pane : 'general'
	}),
	component: SettingsPage
})

function SettingsPage() {
	const { pane } = Route.useSearch()
	const label = SETTINGS_NAV_ITEMS.find((item) => item.id === pane)?.label ?? 'Settings'

	return <SettingsLayout activeId={pane}>{renderPane(pane, label)}</SettingsLayout>
}

function renderPane(id: SettingsPaneId, label: string) {
	if (id === 'general') return <SettingsPaneGeneral />
	if (id === 'integrations') return <SettingsPaneIntegrations />
	if (id === 'providers') return <SettingsPaneProviders />
	if (id === 'skills') return <SettingsPaneSkills />
	if (id === 'profiles') return <SettingsPaneProfiles />
	if (id === 'rules') return <SettingsPaneRules />
	if (id === 'runtimes') return <SettingsPaneRuntimes />
	return <SettingsPaneComingSoon label={label} />
}
