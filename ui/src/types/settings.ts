export type SettingsPaneId =
	| 'general'
	| 'integrations'
	| 'providers'
	| 'skills'
	| 'profiles'
	| 'runtimes'
	| 'sandboxes'
	| 'rules'
	| 'budgets'
	| 'webhooks'
	| 'api-tokens'
	| 'members'

export type SettingsScope = 'global' | 'project'

export interface SettingsNavItem {
	id: SettingsPaneId
	label: string
	scope: SettingsScope
}

export interface SettingsRule {
	id: string
	label: string
	hint: string
	status: 'on' | 'off' | 'dry-run'
	meta?: string
}
