import type { SettingsNavItem, SettingsPaneId, SettingsScope } from '@/types'

export const SETTINGS_NAV_GROUPS: { scope: SettingsScope; label: string }[] = [
	{ scope: 'global', label: 'Global' },
	{ scope: 'project', label: 'Project' }
]

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
	{ id: 'general', label: 'General', scope: 'global' },
	{ id: 'integrations', label: 'Integrations', scope: 'project' },
	{ id: 'providers', label: 'Providers', scope: 'project' },
	{ id: 'skills', label: 'Skills', scope: 'project' },
	{ id: 'profiles', label: 'Launch profiles', scope: 'project' },
	{ id: 'runtimes', label: 'Runtimes', scope: 'project' },
	{ id: 'runner', label: 'Runner', scope: 'project' },
	{ id: 'sandboxes', label: 'Sandboxes', scope: 'project' },
	{ id: 'rules', label: 'Rules & guardrails', scope: 'project' },
	{ id: 'budgets', label: 'Budgets', scope: 'project' },
	{ id: 'webhooks', label: 'Webhooks', scope: 'project' },
	{ id: 'api-tokens', label: 'API tokens', scope: 'project' },
	{ id: 'members', label: 'Members', scope: 'project' }
]

export function settingsNavItemsForScope(scope: SettingsScope): SettingsNavItem[] {
	return SETTINGS_NAV_ITEMS.filter((item) => item.scope === scope)
}

const PANE_IDS = new Set<string>(SETTINGS_NAV_ITEMS.map((item) => item.id))

export function isSettingsPaneId(value: unknown): value is SettingsPaneId {
	return typeof value === 'string' && PANE_IDS.has(value)
}
