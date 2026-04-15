import type { ExecutionMode } from './runs'

export interface LaunchProfile {
	use_worktree: boolean
	live_mode: boolean
	skills: string[]
	default_instructions: string
	handoff_instructions: string
}

export interface ServerConfigResponse {
	repo_slug: string
	base_branch: string
	launch_profile: LaunchProfile
}

export interface LaunchParams {
	config: ServerConfigResponse
	issueId: string
	issueIdentifier: string
	useWorktree?: boolean
	executionMode?: ExecutionMode
	operatorInstructions?: string
	onSuccess?: () => void
}
