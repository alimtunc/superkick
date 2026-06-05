// SUP-117 — Launch Task types mirror `superkick_core::launch_task`.
// Hand-maintained because the backend does not emit a TS schema today.
import type { AgentProvider } from './agents'
import type { ProfileSnapshot, ProfileStep } from './profiles'
import type { ExecutionMode } from './runs'
import type { SkillSource } from './skills'

// Legacy `launch_profile` config block, renamed from `LaunchProfile` (that name
// now belongs to the app-managed launch profile in `./profiles`). Still served
// via `/config` for the legacy launch flow.
export interface LaunchProfileSettings {
	use_worktree: boolean
	live_mode: boolean
	skills: string[]
	default_instructions: string
	handoff_instructions: string
}

export interface ServerConfigResponse {
	repo_slug: string
	base_branch: string
	launch_profile: LaunchProfileSettings
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

export type LaunchRecipe = 'plan_implement_review' | 'dynamic'

export type LaunchStepKind = 'plan' | 'implement' | 'review'

// ── shared launch-config enums (mirror superkick-core) ────────

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'ultra_code'

export type StepExecutor = 'codex_structured' | 'claude_workflow' | 'interactive_pty' | 'future'

export type SessionPolicy = 'fresh' | 'resume' | 'same_session' | 'same_workflow' | 'takeover'

export type OutputExpectation = 'plan' | 'patch' | 'review' | 'comment' | 'no_op'

export type LaunchTaskStatus = 'pending' | 'running' | 'needs_human' | 'completed' | 'failed' | 'cancelled'

export type LaunchTaskStepStatus =
	| 'pending'
	| 'running'
	| 'completed'
	| 'failed'
	| 'needs_human'
	| 'skipped'
	| 'cancelled'

export type StepResultStatus = 'completed' | 'needs_human' | 'failed'

export interface StepResult {
	status: StepResultStatus
	summary: string
	changed_files: string[]
	questions: string[]
}

// `timeout.after` is milliseconds; `reset_at` is a free-form provider wall-clock string.
export type FailureClassification =
	| { kind: 'missing_marker' }
	| { kind: 'malformed_marker'; detail: string }
	| { kind: 'agent_reported'; status: StepResultStatus; summary: string }
	| { kind: 'auth_required'; provider: AgentProvider }
	| { kind: 'quota_exceeded'; provider: AgentProvider; reset_at?: string | null }
	| { kind: 'cli_missing'; binary: string; install_hint: string }
	| { kind: 'timeout'; after: number }
	| { kind: 'no_diff' }
	| { kind: 'tests_failed'; summary: string }
	| { kind: 'spawn_error'; detail: string }
	| { kind: 'agent_non_zero_exit'; exit_code: number; role: string }

// Mirror of `superkick_core::FailureDisposition`; computed via `getDisposition`.
export type FailureDisposition = 'needs_human' | 'failed'

export interface LaunchTaskStep {
	id: string
	launch_task_id: string
	sequence: number
	step_kind: LaunchStepKind
	agent_name: string
	provider: AgentProvider | null
	model: string | null
	mode: ExecutionMode | null
	/** Dynamic-step snapshot fields; null on legacy / v1-recipe rows. */
	label?: string | null
	skill_source?: SkillSource | null
	reasoning?: ReasoningEffort | null
	executor?: StepExecutor | null
	session_policy?: SessionPolicy | null
	output_expectation?: OutputExpectation | null
	/** Undefined on legacy rows (implicitly enabled); `false` only for skipped dynamic steps. */
	enabled?: boolean
	status: LaunchTaskStepStatus
	linked_run_id?: string | null
	linked_conversation_id?: string | null
	linked_orchestrator_session_id?: string | null
	summary?: string | null
	structured_result?: StepResult | null
	failure_classification?: FailureClassification | null
	/** SUP-191 — automatic resume attempts spent after a mid-turn timeout. */
	auto_resume_count: number
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
	/** The launch profile this task was composed from. */
	profile_id?: string | null
	profile_snapshot?: ProfileSnapshot | null
	created_at: string
	updated_at: string
}

export interface LaunchTaskWithSteps {
	task: LaunchTask
	steps: LaunchTaskStep[]
}

export interface CreateLaunchTaskRequest {
	linear_issue_id: string
	/** Dynamic path: launch from a profile, optionally with edits. */
	profile_id?: string
	step_overrides?: ProfileStep[]
	/** Legacy v1-recipe path; required only when `profile_id` is absent. */
	planner_agent?: string
	coder_agent?: string
	reviewer_agent?: string
	base_branch?: string
	use_worktree?: boolean
}

export type LaunchWorktreeStrategy = 'new_worktree' | 'current_checkout'

// SUP-120 — operator action responses. Mirror the Rust structs exactly; only
// fields the UI consumes are typed.

export interface CancelLaunchTaskResponse {
	task_id: string
	status: LaunchTaskStatus
	signalled: boolean
}

export interface RetryLaunchTaskResponse {
	task_id: string
	status: LaunchTaskStatus
	step_id: string
	new_linked_run_id: string | null
}

// SUP-127 — UI-only value passed between LaunchComposer and IssueChipPicker.
// Narrower than `LinearIssueListItem` because the picker only needs the bits
// it displays in the trigger.
export interface IssueChipPickerValue {
	id: string
	identifier: string
	title: string
}

export interface BlockingContext {
	step: LaunchTaskStep | null
	stepKind: LaunchStepKind | null
	headline: string
	hint: string
	classification: FailureClassification | null
}

export type TerminalKind = 'success' | 'failure'

// SUP-154 — operator intervention on a running Launch Task.

export interface LaunchTaskIntervention {
	id: string
	launch_task_id: string
	target_step_id?: string | null
	author: string
	body: string
	created_at: string
	consumed_at?: string | null
}

export interface CreateInterventionRequest {
	body: string
	target_step_id?: string | null
	author?: string | null
}
