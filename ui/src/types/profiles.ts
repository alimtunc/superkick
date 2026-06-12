// App-managed launch profiles. Mirror `superkick_core::launch_profile`.
import type { AgentProvider } from './agents'
import type {
	LaunchStepKind,
	OutputExpectation,
	ReasoningEffort,
	SessionPolicy,
	StepExecutor
} from './launch'
import type { SkillSource } from './skills'

export type ProfileKind =
	| 'standard'
	| 'fast_fix'
	| 'plan_only'
	| 'implement_only'
	| 'review_only'
	| 'claude_workflow'
	| 'full_session'
	| 'custom'

export interface ProfileStep {
	ordering: number
	label: string
	skill_ref: string
	provider: AgentProvider
	model?: string | null
	reasoning: ReasoningEffort
	executor: StepExecutor
	session_policy: SessionPolicy
	output_expectation: OutputExpectation
	enabled: boolean
}

export interface LaunchProfile {
	id: string
	name: string
	kind: ProfileKind
	is_default: boolean
	is_readonly: boolean
	steps: ProfileStep[]
}

// Frozen step in a `ProfileSnapshot` — carries the resolved skill source and
// the runtime step kind in addition to the editable `ProfileStep` fields.
export interface StepSnapshot {
	ordering: number
	label: string
	skill_ref: string
	skill_source: SkillSource
	step_kind: LaunchStepKind
	provider: AgentProvider
	model?: string | null
	reasoning: ReasoningEffort
	executor: StepExecutor
	session_policy: SessionPolicy
	output_expectation: OutputExpectation
	enabled: boolean
}

export interface ProfileSnapshot {
	profile_id: string
	profile_name: string
	profile_kind: ProfileKind
	steps: StepSnapshot[]
}

export interface PreviewProfileRequest {
	profile_id: string
	step_overrides?: ProfileStep[]
}
