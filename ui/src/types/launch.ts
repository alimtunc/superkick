// SUP-117 — Launch Task types mirror `superkick_core::launch_task`.
// Hand-maintained because the backend does not emit a TS schema today.
import type { AgentProvider } from './agents'
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

// ── Launch tasks (SUP-116 wire format) ───────────────────────────────
//
// Mirror the snake_case JSON emitted by the Rust API verbatim — the rest
// of the TS codebase (runs.ts, issues.ts) follows the same convention.

export type LaunchRecipe = 'plan_implement_review'

export type LaunchStepKind = 'plan' | 'implement' | 'review'

export type LaunchTaskStatus = 'pending' | 'running' | 'needs_human' | 'completed' | 'failed' | 'cancelled'

export type LaunchTaskStepStatus =
	| 'pending'
	| 'running'
	| 'completed'
	| 'failed'
	| 'needs_human'
	| 'skipped'
	| 'cancelled'

export interface LaunchTaskStep {
	id: string
	launch_task_id: string
	sequence: number
	step_kind: LaunchStepKind
	agent_name: string
	provider: AgentProvider | null
	model: string | null
	mode: ExecutionMode | null
	status: LaunchTaskStepStatus
	linked_run_id?: string | null
	linked_conversation_id?: string | null
	linked_orchestrator_session_id?: string | null
	summary?: string | null
	created_at: string
	updated_at: string
}

export interface LaunchTask {
	id: string
	linear_issue_id: string
	recipe_kind: LaunchRecipe
	status: LaunchTaskStatus
	current_step_id?: string | null
	summary?: string | null
	created_at: string
	updated_at: string
}

export interface LaunchTaskWithSteps {
	task: LaunchTask
	steps: LaunchTaskStep[]
}

export interface CreateLaunchTaskRequest {
	linear_issue_id: string
	planner_agent: string
	coder_agent: string
	reviewer_agent: string
}
