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

// Executors are provider-specific (except interactive_pty, which both support).
// Showing a Claude executor under the Codex provider produces an invalid step.
const EXECUTOR_OPTIONS_BY_PROVIDER: Record<AgentProvider, StepExecutor[]> = {
	codex: ['codex_structured', 'interactive_pty'],
	claude: ['claude_workflow', 'claude_background', 'interactive_pty']
}

const DEFAULT_EXECUTOR_BY_PROVIDER: Record<AgentProvider, StepExecutor> = {
	codex: 'codex_structured',
	claude: 'claude_workflow'
}

export function executorOptionsFor(provider: AgentProvider): StepExecutor[] {
	return EXECUTOR_OPTIONS_BY_PROVIDER[provider]
}

export function clampExecutorForProvider(executor: StepExecutor, provider: AgentProvider): StepExecutor {
	return executorOptionsFor(provider).includes(executor) ? executor : DEFAULT_EXECUTOR_BY_PROVIDER[provider]
}
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
	claude_background: 'Claude background',
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
	claude_background: 'Claude background',
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
	'claude_background',
	'full_session',
	'custom'
]
