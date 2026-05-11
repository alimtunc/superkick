import type { Agent, LaunchStepKind } from '@/types'

/**
 * Single source of truth for the kind → recommended-role mapping. Both
 * `pickDefaultAgent` (default selection) and `AgentPicker` (recommended-badge
 * highlight) read from here so they cannot drift when a 4th step kind lands.
 */
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

/**
 * Whether `agent` is a recommended fit for a step kind. Matches in this order:
 * explicit `role`, exact name on the canonical role, then a fuzzy name hint
 * (so an agent literally called `review` is treated as the reviewer default
 * even when superkick.yaml sets no `role`).
 */
export function isRecommendedAgent(agent: Agent, kind: LaunchStepKind): boolean {
	const target = ROLE_BY_KIND[kind]
	if (agent.role === target) return true
	if (agent.name === target) return true
	const hints = NAME_HINTS_BY_KIND[kind]
	const lowered = agent.name.toLowerCase()
	return hints.some((h) => lowered.includes(h))
}

/**
 * SUP-117 — pick the default agent for a Launch Task step. Prefers a
 * recommended agent (see `isRecommendedAgent`), falling back to `agents[0]`
 * when no agent matches.
 */
export function pickDefaultAgent(agents: readonly Agent[], kind: LaunchStepKind): Agent | null {
	if (agents.length === 0) return null
	const recommended = agents.find((a) => isRecommendedAgent(a, kind))
	if (recommended) return recommended
	return agents[0] ?? null
}
