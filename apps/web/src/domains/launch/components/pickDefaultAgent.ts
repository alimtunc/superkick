import type { Agent, AgentProvider, LaunchStepKind } from '@/types'

export const ROLE_BY_KIND: Record<LaunchStepKind, string> = {
	plan: 'planner',
	implement: 'coder',
	review: 'reviewer'
}

const NAME_HINTS_BY_KIND: Record<LaunchStepKind, readonly string[]> = {
	plan: ['plan', 'planner', 'planning'],
	implement: ['implement', 'implementation', 'coder', 'code', 'dev', 'developer'],
	review: ['review', 'reviewer']
}

const PROVIDER_PRIORITY: readonly AgentProvider[] = ['codex', 'claude']

export function isRecommendedAgent(agent: Agent, kind: LaunchStepKind): boolean {
	const target = ROLE_BY_KIND[kind]
	if (agent.role !== null) return agent.role === target
	if (agent.name === target) return true
	const hints = NAME_HINTS_BY_KIND[kind]
	const lowered = agent.name.toLowerCase()
	return hints.some((h) => lowered.includes(h))
}

function pickByProvider(
	agents: readonly Agent[],
	provider: AgentProvider,
	kind: LaunchStepKind,
	origin: Agent['origin']
): Agent | null {
	return (
		agents.find((a) => a.provider === provider && a.origin === origin && isRecommendedAgent(a, kind)) ??
		null
	)
}

// Priority: Codex built-in → Claude built-in → matching custom → first agent.
// Custom never shadows a matching built-in.
export function pickDefaultAgent(agents: readonly Agent[], kind: LaunchStepKind): Agent | null {
	if (agents.length === 0) return null
	for (const provider of PROVIDER_PRIORITY) {
		const builtin = pickByProvider(agents, provider, kind, 'builtin')
		if (builtin) return builtin
	}
	const custom = agents.find((a) => a.origin === 'custom' && isRecommendedAgent(a, kind))
	if (custom) return custom
	const anyMatch = agents.find((a) => isRecommendedAgent(a, kind))
	if (anyMatch) return anyMatch
	return agents[0] ?? null
}
