export type SettingsPaneId =
	| 'general'
	| 'integrations'
	| 'providers'
	| 'skills'
	| 'profiles'
	| 'runtimes'
	| 'runner'
	| 'sandboxes'
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

export interface RunnerConfigResponse {
	worktree_prefix: string
	base_branch: string
	setup_commands: string[]
	requires_restart: boolean
}

export interface RunnerConfigUpdate {
	worktree_prefix: string
	base_branch: string
	setup_commands: string[]
}

export interface RunnerValidationErrors {
	worktreePrefix: string | null
	baseBranch: string | null
}
