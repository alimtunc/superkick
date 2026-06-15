import { groupAgents } from '@/components/launch/groupAgents'
import type { Agent } from '@/types'
import { describe, expect, it } from 'vitest'

function agent(overrides: Partial<Agent> & Pick<Agent, 'name' | 'provider' | 'origin'>): Agent {
	return {
		role: 'coder',
		model: null,
		runner_mode: 'exec_json',
		executor: 'codex_structured',
		default_reasoning: 'medium',
		billing_profile: 'subscription',
		enabled: true,
		avatar: null,
		description: null,
		...overrides
	}
}

describe('groupAgents', () => {
	it('orders Codex before Claude with built-ins before custom', () => {
		const groups = groupAgents([
			agent({ name: 'codex-implement', provider: 'codex', origin: 'builtin' }),
			agent({ name: 'claude-implement', provider: 'claude', origin: 'builtin' }),
			agent({ name: 'team-coder', provider: 'claude', origin: 'custom' })
		])
		expect(groups.map((g) => g.provider)).toEqual(['codex', 'claude'])
		expect(groups[0]?.builtin.map((a) => a.name)).toEqual(['codex-implement'])
		expect(groups[0]?.custom).toHaveLength(0)
		expect(groups[1]?.builtin.map((a) => a.name)).toEqual(['claude-implement'])
		expect(groups[1]?.custom.map((a) => a.name)).toEqual(['team-coder'])
	})

	it('drops a provider with no agents', () => {
		const groups = groupAgents([agent({ name: 'claude-plan', provider: 'claude', origin: 'builtin' })])
		expect(groups.map((g) => g.provider)).toEqual(['claude'])
	})

	it('returns an empty list when the catalog is empty', () => {
		expect(groupAgents([])).toEqual([])
	})
})
