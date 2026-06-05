// App-managed skill definitions. Mirror `superkick_core::skill`.
import type { AgentProvider } from './agents'
import type { OutputExpectation, ReasoningEffort, SessionPolicy, StepExecutor } from './launch'

export type SkillKind = 'plan' | 'implement' | 'review' | 'pre_pr_review' | 'custom'

export type SkillOrigin = 'builtin' | 'custom'

// Tagged union mirroring the Rust `SkillSource` (serde tag = "kind").
export type SkillSource = { kind: 'installed'; value: string } | { kind: 'prompt'; value: string }

export interface SkillDefinition {
	id: string
	label: string
	kind: SkillKind
	source: SkillSource
	default_provider: AgentProvider
	default_model?: string | null
	default_reasoning: ReasoningEffort
	default_executor: StepExecutor
	default_session_policy: SessionPolicy
	default_output_expectation: OutputExpectation
	enabled: boolean
	origin: SkillOrigin
}
