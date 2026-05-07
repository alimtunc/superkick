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

/**
 * SUP-117 — pick the default agent for a Launch Task step. Heuristic is
 * intentionally simple: prefer an exact `role` match, then a name match, then
 * the first agent in the catalog. A future iteration (P2 in the plan) will
 * replace this with explicit `capabilities` on the agent definition.
 */
export function pickDefaultAgent(agents: readonly Agent[], kind: LaunchStepKind): Agent | null {
	if (agents.length === 0) return null
	const target = ROLE_BY_KIND[kind]
	const byRole = agents.find((a) => a.role === target)
	if (byRole) return byRole
	const byName = agents.find((a) => a.name === target)
	if (byName) return byName
	return agents[0] ?? null
}
