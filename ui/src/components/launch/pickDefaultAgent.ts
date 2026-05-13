import type { Agent, LaunchStepKind } from '@/types'

// Single source of truth for the kind → recommended-role mapping so
// pickDefaultAgent and AgentPicker cannot drift.
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

export function isRecommendedAgent(agent: Agent, kind: LaunchStepKind): boolean {
	const target = ROLE_BY_KIND[kind]
	if (agent.role === target) return true
	if (agent.name === target) return true
	const hints = NAME_HINTS_BY_KIND[kind]
	const lowered = agent.name.toLowerCase()
	return hints.some((h) => lowered.includes(h))
}

export function pickDefaultAgent(agents: readonly Agent[], kind: LaunchStepKind): Agent | null {
	if (agents.length === 0) return null
	const recommended = agents.find((a) => isRecommendedAgent(a, kind))
	if (recommended) return recommended
	return agents[0] ?? null
}
