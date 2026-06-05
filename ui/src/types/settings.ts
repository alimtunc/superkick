export type SettingsPaneId =
	| 'general'
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

export interface SettingsNavItem {
	id: SettingsPaneId
	label: string
}

export interface SettingsRule {
	id: string
	label: string
	hint: string
	status: 'on' | 'off' | 'dry-run'
	meta?: string
}
