// Agent roster/editor helpers (option lists and provider clamps live in
// `./launchConfigOptions`).
import type { AgentProvider, ManagedAgent, RunnerMode, StepExecutor } from '@/types'

import { DEFAULT_AGENT_AVATAR } from './agentAvatar'
import { clampReasoningForProvider } from './launchConfigOptions'

const DEFAULT_RUNNER_MODE_BY_PROVIDER: Record<AgentProvider, RunnerMode> = {
	codex: 'exec_json',
	claude: 'interactive_pty'
}

// Inverse of `StepExecutor::runner_mode` in superkick-core. The agent stores
// `runner_mode` (authoritative); the editor presents an executor select.
const EXECUTOR_BY_RUNNER_MODE: Record<RunnerMode, StepExecutor> = {
	exec_json: 'codex_structured',
	print_stream_json: 'claude_workflow',
	background_session: 'claude_background',
	interactive_pty: 'interactive_pty'
}

const RUNNER_MODE_BY_EXECUTOR: Record<StepExecutor, RunnerMode | null> = {
	codex_structured: 'exec_json',
	claude_workflow: 'print_stream_json',
	claude_background: 'background_session',
	interactive_pty: 'interactive_pty',
	future: null
}

/** The executor an agent's `runner_mode` resolves to (defaulting per provider). */
export function agentExecutor(agent: ManagedAgent): StepExecutor {
	const mode = agent.runner_mode ?? DEFAULT_RUNNER_MODE_BY_PROVIDER[agent.provider]
	return EXECUTOR_BY_RUNNER_MODE[mode]
}

/** Map an editor executor selection back to the persisted `runner_mode`. */
export function runnerModeForExecutor(executor: StepExecutor): RunnerMode | null {
	return RUNNER_MODE_BY_EXECUTOR[executor]
}

/** All agents can be hard-deleted; built-ins are additionally re-seedable via
 *  "Restore default" (a delete tombstones the built-in so it stays gone). */
export function isBuiltinAgent(agent: { origin: ManagedAgent['origin'] }): boolean {
	return agent.origin === 'builtin'
}

/** Destructive-delete copy for an agent; built-ins note Restore default. */
export function agentDeleteDescription(name: string, builtin: boolean): string {
	return builtin
		? `Delete the built-in agent “${name}”? It will not return on restart — use Restore default to bring it back.`
		: `Delete the custom agent “${name}”? This cannot be undone.`
}

/** A blank custom agent seed for the create flow. */
export function blankAgent(): ManagedAgent {
	const provider: AgentProvider = 'codex'
	return {
		name: '',
		provider,
		role: null,
		model: null,
		system_prompt: null,
		timeout_secs: null,
		max_turns: null,
		origin: 'custom',
		linear_context: 'snapshot',
		mcp_policy: { mode: 'none', servers: [] },
		tool_policy: { allow: null, deny: null, require_approval: false, persist_results: true },
		backend: null,
		runner_mode: DEFAULT_RUNNER_MODE_BY_PROVIDER[provider],
		billing_profile: null,
		default_reasoning: clampReasoningForProvider('medium', provider),
		enabled: true,
		skills: [],
		avatar: { ...DEFAULT_AGENT_AVATAR },
		description: null
	}
}

/** A slug name from a label (mirrors `is_safe_slug`'s accepted shape). The
 *  editor submits this, so any non-empty label resolves to a safe agent name. */
export function slugifyAgentName(label: string): string {
	return label
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
}

/** MCP servers an agent wires, or `none`. */
export function policyServers(agent: ManagedAgent): string {
	return agent.mcp_policy.servers.length > 0 ? agent.mcp_policy.servers.join(', ') : 'none'
}

/** Render a tool allow/deny list, or `none` when unset/empty. */
export function toolList(values: string[] | null): string {
	return values && values.length > 0 ? values.join(', ') : 'none'
}

/** Parse a comma-separated input into a trimmed, non-empty entry list. */
export function commaList(value: string): string[] {
	return value
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)
}

/** Resolve a skill id to its catalog label, falling back to the id. */
export function skillLabel(skills: readonly { id: string; label: string }[], id: string): string {
	return skills.find((skill) => skill.id === id)?.label ?? id
}
