// Option lists + labels for the launch-config selects. Curated model
// lists degrade to free-text input when a provider isn't listed.
import type {
	AgentProvider,
	BillingProfile,
	OutputExpectation,
	PermissionPolicy,
	ProfileKind,
	ReasoningEffort,
	SandboxPolicy,
	SessionPolicy,
	SkillKind,
	StepExecutor
} from '@/types'

export const LAUNCH_PROVIDER_OPTIONS: AgentProvider[] = ['codex', 'claude']

export const EXECUTOR_OPTIONS: StepExecutor[] = ['codex_structured', 'claude_workflow', 'interactive_pty']
export const SESSION_POLICY_OPTIONS: SessionPolicy[] = [
	'fresh',
	'resume',
	'same_session',
	'same_workflow',
	'takeover'
]
export const OUTPUT_EXPECTATION_OPTIONS: OutputExpectation[] = ['plan', 'patch', 'review', 'comment', 'no_op']
export const SANDBOX_OPTIONS: SandboxPolicy[] = ['read_only', 'workspace_write', 'danger_full_access']
export const PERMISSION_OPTIONS: PermissionPolicy[] = ['prompt', 'accept_edits', 'bypass_permissions']
export const BILLING_OPTIONS: BillingProfile[] = [
	'subscription',
	'agent_sdk_credits',
	'api_credits',
	'unknown'
]

export const REASONING_LABEL: Record<ReasoningEffort, string> = {
	minimal: 'Minimal',
	low: 'Low',
	medium: 'Medium',
	high: 'High',
	xhigh: 'X-High',
	max: 'Max'
}

const REASONING_OPTIONS_BY_PROVIDER: Record<AgentProvider, ReasoningEffort[]> = {
	codex: ['minimal', 'low', 'medium', 'high', 'xhigh'],
	claude: ['low', 'medium', 'high', 'xhigh', 'max']
}

export function reasoningOptionsFor(provider: AgentProvider): ReasoningEffort[] {
	return REASONING_OPTIONS_BY_PROVIDER[provider]
}

// Mirrors `ReasoningEffort::clamp_for` in superkick-core.
export function clampReasoningForProvider(value: ReasoningEffort, provider: AgentProvider): ReasoningEffort {
	if (provider === 'codex' && value === 'max') return 'xhigh'
	if (provider === 'claude' && value === 'minimal') return 'low'
	return value
}
export const EXECUTOR_LABEL: Record<StepExecutor, string> = {
	codex_structured: 'Codex (structured)',
	claude_workflow: 'Claude workflow',
	interactive_pty: 'Interactive PTY',
	future: 'Future'
}
export const BILLING_LABEL: Record<BillingProfile, string> = {
	subscription: 'Subscription',
	agent_sdk_credits: 'Agent SDK credits',
	api_credits: 'API credits',
	unknown: 'Unknown'
}
export const SANDBOX_LABEL: Record<SandboxPolicy, string> = {
	read_only: 'Read-only',
	workspace_write: 'Workspace write',
	danger_full_access: 'Full access'
}
export const PERMISSION_LABEL: Record<PermissionPolicy, string> = {
	prompt: 'Prompt',
	accept_edits: 'Accept edits',
	bypass_permissions: 'Bypass permissions'
}
export const SKILL_KIND_LABEL: Record<SkillKind, string> = {
	plan: 'Plan',
	implement: 'Implement',
	review: 'Review',
	pre_pr_review: 'Pre-PR review',
	custom: 'Custom'
}
export const SKILL_KIND_OPTIONS: SkillKind[] = ['plan', 'implement', 'review', 'pre_pr_review', 'custom']
export const SESSION_POLICY_LABEL: Record<SessionPolicy, string> = {
	fresh: 'Fresh',
	resume: 'Resume',
	same_session: 'Same session',
	same_workflow: 'Same workflow',
	takeover: 'Takeover'
}
export const OUTPUT_EXPECTATION_LABEL: Record<OutputExpectation, string> = {
	plan: 'Plan',
	patch: 'Patch',
	review: 'Review',
	comment: 'Comment',
	no_op: 'No-op'
}
export const PROFILE_KIND_LABEL: Record<ProfileKind, string> = {
	standard: 'Standard',
	fast_fix: 'Fast fix',
	plan_only: 'Plan only',
	implement_only: 'Implement only',
	review_only: 'Review only',
	claude_workflow: 'Claude workflow',
	full_session: 'Full session',
	custom: 'Custom'
}

export const PROFILE_KIND_OPTIONS: ProfileKind[] = [
	'standard',
	'fast_fix',
	'plan_only',
	'implement_only',
	'review_only',
	'claude_workflow',
	'full_session',
	'custom'
]

export const CURATED_MODELS: Record<string, string[]> = {
	codex: ['gpt-5-codex', 'gpt-5', 'o4-mini'],
	claude: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5']
}

/** Whether selecting this executor consumes paid Agent SDK credits. */
export function isPaidExecutor(executor: StepExecutor): boolean {
	return executor === 'claude_workflow'
}
