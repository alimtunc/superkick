import { isRecommendedAgent, pickDefaultAgent } from '@/components/launch/pickDefaultAgent'
import type { Agent } from '@/types'
import { describe, expect, it } from 'vitest'

function agent(overrides: Partial<Agent> & Pick<Agent, 'name' | 'provider' | 'role'>): Agent {
	return {
		model: null,
		runner_mode: 'exec_json',
		executor: 'codex_structured',
		default_reasoning: 'medium',
		billing_profile: 'subscription',
		origin: 'builtin',
		enabled: true,
		avatar: null,
		description: null,
		...overrides
	}
}

const CATALOG: Agent[] = [
	agent({ name: 'codex-plan', provider: 'codex', role: 'planner' }),
	agent({ name: 'codex-implement', provider: 'codex', role: 'coder' }),
	agent({ name: 'codex-review', provider: 'codex', role: 'reviewer' }),
	agent({
		name: 'claude-plan',
		provider: 'claude',
		role: 'planner',
		runner_mode: 'interactive_pty'
	}),
	agent({
		name: 'claude-implement',
		provider: 'claude',
		role: 'coder',
		runner_mode: 'interactive_pty'
	}),
	agent({
		name: 'claude-review',
		provider: 'claude',
		role: 'reviewer',
		runner_mode: 'interactive_pty'
	})
]

describe('pickDefaultAgent', () => {
	it('prefers the Codex built-in for plan / implement / review', () => {
		expect(pickDefaultAgent(CATALOG, 'plan')?.name).toBe('codex-plan')
		expect(pickDefaultAgent(CATALOG, 'implement')?.name).toBe('codex-implement')
		expect(pickDefaultAgent(CATALOG, 'review')?.name).toBe('codex-review')
	})

	it('falls back to Claude built-in when Codex is unavailable for the role', () => {
		const noCodexCoder = CATALOG.filter((a) => a.name !== 'codex-implement')
		expect(pickDefaultAgent(noCodexCoder, 'implement')?.name).toBe('claude-implement')
	})

	it('falls back to a matching custom agent when no built-in fits the role', () => {
		const custom = agent({
			name: 'team-coder',
			provider: 'claude',
			role: 'coder',
			origin: 'custom',
			runner_mode: 'interactive_pty'
		})
		const onlyCustom = [custom]
		expect(pickDefaultAgent(onlyCustom, 'implement')?.name).toBe('team-coder')
	})

	it('does not let a custom agent shadow the recommended Codex built-in', () => {
		const customCoder = agent({
			name: 'team-coder',
			provider: 'claude',
			role: 'coder',
			origin: 'custom',
			runner_mode: 'interactive_pty'
		})
		const merged = [...CATALOG, customCoder]
		expect(pickDefaultAgent(merged, 'implement')?.name).toBe('codex-implement')
	})

	it('returns null for an empty catalog', () => {
		expect(pickDefaultAgent([], 'plan')).toBeNull()
	})

	it('treats role as authoritative — a planner-role agent named "implement" is not recommended for implement', () => {
		const mislabeled = agent({
			name: 'codex-implement',
			provider: 'codex',
			role: 'planner'
		})
		expect(isRecommendedAgent(mislabeled, 'implement')).toBe(false)
		expect(isRecommendedAgent(mislabeled, 'plan')).toBe(true)
	})
})
