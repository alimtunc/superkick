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
	| 'claude_background'
	| 'full_session'
	| 'custom'

export interface ProfileStep {
	ordering: number
	label: string
	skill_ref: string
	/** App-managed agent (by name) that seeds this step's execution fields.
	 *  `null` on the skill-first path; absent on the wire (server omits `None`). */
	agent_ref?: string | null
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

// A profile referencing a given skill/agent, with the labels of the matching
// steps. Returned by the delete-warning reverse-lookup. Mirrors
// `superkick_core::launch_profile::ProfileUsage`.
export interface ProfileUsage {
	id: string
	name: string
	steps: string[]
}

// Frozen step in a `ProfileSnapshot` — carries the resolved skill source and
// the runtime step kind in addition to the editable `ProfileStep` fields.
export interface StepSnapshot {
	ordering: number
	label: string
	skill_ref: string
	/** Frozen copy of `ProfileStep.agent_ref`. */
	agent_ref?: string | null
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
