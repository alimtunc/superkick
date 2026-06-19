import { SettingsLayout } from '@/domains/settings/components/SettingsLayout'
import { isSettingsPaneId, SETTINGS_NAV_ITEMS } from '@/domains/settings/components/settingsNav'
import { SettingsPaneComingSoon } from '@/domains/settings/components/SettingsPaneComingSoon'
import { SettingsPaneGeneral } from '@/domains/settings/components/SettingsPaneGeneral'
import { SettingsPaneIntegrations } from '@/domains/settings/components/SettingsPaneIntegrations'
import { SettingsPaneProfiles } from '@/domains/settings/components/SettingsPaneProfiles'
import { SettingsPaneProviders } from '@/domains/settings/components/SettingsPaneProviders'
import { SettingsPaneRunner } from '@/domains/settings/components/SettingsPaneRunner'
import { SettingsPaneRuntimes } from '@/domains/settings/components/SettingsPaneRuntimes'
import { SettingsPaneSkillsLink } from '@/domains/settings/components/SettingsPaneSkillsLink'
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
	if (id === 'skills') return <SettingsPaneSkillsLink />
	if (id === 'profiles') return <SettingsPaneProfiles />
	if (id === 'runtimes') return <SettingsPaneRuntimes />
	if (id === 'runner') return <SettingsPaneRunner />
	return <SettingsPaneComingSoon label={label} />
}
