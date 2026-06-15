import {
	addStep,
	applySkillToStep,
	moveStep,
	removeStep,
	setStepAgent,
	setStepProvider,
	updateStep
} from '@/lib/stepReducer'
import type { Agent, ProfileStep, SkillDefinition } from '@/types'
import { describe, expect, it } from 'vitest'

function step(overrides: Partial<ProfileStep> = {}): ProfileStep {
	return {
		ordering: 1,
		label: 'Implement',
		skill_ref: 'implement',
		agent_ref: null,
		provider: 'codex',
		model: null,
		reasoning: 'medium',
		executor: 'codex_structured',
		session_policy: 'fresh',
		output_expectation: 'patch',
		enabled: true,
		...overrides
	}
}

function skill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
	return {
		id: 'ticket',
		label: 'Ticket (A→Z)',
		kind: 'custom',
		source: { kind: 'installed', value: 'ticket' },
		default_provider: 'claude',
		default_model: null,
		default_reasoning: 'high',
		default_executor: 'interactive_pty',
		default_session_policy: 'fresh',
		default_output_expectation: 'patch',
		enabled: true,
		origin: 'builtin',
		artifact_kind: 'skill',
		...overrides
	}
}

function agent(overrides: Partial<Agent> = {}): Agent {
	return {
		name: 'claude-implement',
		provider: 'claude',
		role: 'coder',
		model: null,
		runner_mode: 'interactive_pty',
		executor: 'interactive_pty',
		default_reasoning: 'high',
		billing_profile: 'subscription',
		origin: 'builtin',
		enabled: true,
		avatar: null,
		description: null,
		...overrides
	}
}

function find(steps: ProfileStep[], ordering: number): ProfileStep {
	const found = steps.find((s) => s.ordering === ordering)
	if (!found) throw new Error(`no step with ordering ${ordering}`)
	return found
}

describe('applySkillToStep', () => {
	it('seeds the step from the skill defaults', () => {
		const next = applySkillToStep(
			[step({ model: 'gpt-5-codex' })],
			1,
			skill({ default_model: 'claude-opus-4-8' })
		)
		expect(find(next, 1)).toMatchObject({
			skill_ref: 'ticket',
			label: 'Ticket (A→Z)',
			provider: 'claude',
			model: 'claude-opus-4-8',
			reasoning: 'high',
			executor: 'interactive_pty'
		})
	})

	it('clears the model when the skill flips provider without a default_model', () => {
		const next = applySkillToStep(
			[step({ provider: 'codex', model: 'gpt-5-codex' })],
			1,
			skill({ default_provider: 'claude', default_model: undefined })
		)
		expect(find(next, 1)).toMatchObject({ provider: 'claude', model: null })
	})

	it('keeps the model when the skill targets the same provider without a default_model', () => {
		const next = applySkillToStep(
			[step({ provider: 'claude', model: 'claude-opus-4-8' })],
			1,
			skill({ default_provider: 'claude', default_model: undefined })
		)
		expect(find(next, 1).model).toBe('claude-opus-4-8')
	})

	it('clamps the skill default reasoning to its default provider', () => {
		const next = applySkillToStep(
			[step()],
			1,
			skill({ default_provider: 'codex', default_reasoning: 'max' })
		)
		expect(find(next, 1).reasoning).toBe('xhigh')
	})

	it('does not touch other steps', () => {
		const next = applySkillToStep(
			[step(), step({ ordering: 2, label: 'Review', skill_ref: 'review' })],
			1,
			skill()
		)
		expect(find(next, 2).skill_ref).toBe('review')
	})
})

describe('setStepProvider', () => {
	it('clamps max to xhigh when switching to codex', () => {
		const next = setStepProvider([step({ provider: 'claude', reasoning: 'max' })], 1, 'codex')
		expect(find(next, 1)).toMatchObject({ provider: 'codex', reasoning: 'xhigh' })
	})

	it('clamps minimal to low when switching to claude', () => {
		const next = setStepProvider([step({ provider: 'codex', reasoning: 'minimal' })], 1, 'claude')
		expect(find(next, 1)).toMatchObject({ provider: 'claude', reasoning: 'low' })
	})

	it('clears the model when switching to another provider', () => {
		const next = setStepProvider([step({ provider: 'codex', model: 'gpt-5-codex' })], 1, 'claude')
		expect(find(next, 1)).toMatchObject({ provider: 'claude', model: null })
	})

	it('keeps the model when re-selecting the same provider', () => {
		const next = setStepProvider([step({ provider: 'codex', model: 'gpt-5-codex' })], 1, 'codex')
		expect(find(next, 1).model).toBe('gpt-5-codex')
	})
})

describe('setStepAgent', () => {
	it('sets agent_ref and seeds provider/model/reasoning/executor from the agent', () => {
		const next = setStepAgent(
			[step({ provider: 'codex', model: 'gpt-5-codex' })],
			1,
			agent({
				name: 'team-coder',
				provider: 'claude',
				model: 'claude-opus-4-8',
				default_reasoning: 'high'
			})
		)
		expect(find(next, 1)).toMatchObject({
			agent_ref: 'team-coder',
			provider: 'claude',
			model: 'claude-opus-4-8',
			reasoning: 'high',
			executor: 'interactive_pty'
		})
	})

	it('clears agent_ref and reverts to skill-first when the agent is null', () => {
		const next = setStepAgent([step({ agent_ref: 'team-coder' })], 1, null)
		expect(find(next, 1).agent_ref).toBeNull()
		expect(find(next, 1).skill_ref).toBe('implement')
	})

	it('clamps the agent default reasoning to the agent provider', () => {
		const next = setStepAgent([step()], 1, agent({ provider: 'codex', default_reasoning: 'max' }))
		expect(find(next, 1).reasoning).toBe('xhigh')
	})

	it('clears the model when the agent flips provider without its own model', () => {
		const next = setStepAgent(
			[step({ provider: 'codex', model: 'gpt-5-codex' })],
			1,
			agent({ provider: 'claude', model: null })
		)
		expect(find(next, 1).model).toBeNull()
	})

	it('does not touch other steps', () => {
		const next = setStepAgent(
			[step(), step({ ordering: 2, label: 'Review', skill_ref: 'review' })],
			1,
			agent()
		)
		expect(find(next, 2).agent_ref).toBeNull()
		expect(find(next, 2).skill_ref).toBe('review')
	})
})

describe('move / remove / add renumber', () => {
	it('renumbers after removing a step', () => {
		const next = removeStep([step(), step({ ordering: 2 }), step({ ordering: 3 })], 2)
		expect(next.map((s) => s.ordering)).toEqual([1, 2])
	})

	it('swaps and renumbers on move down', () => {
		const next = moveStep([step({ label: 'A' }), step({ ordering: 2, label: 'B' })], 1, 'down')
		expect(next.map((s) => s.label)).toEqual(['B', 'A'])
		expect(next.map((s) => s.ordering)).toEqual([1, 2])
	})

	it('appends a default step with the next ordering', () => {
		const next = addStep([step()])
		expect(next).toHaveLength(2)
		expect(find(next, 2).label).toBe('New step')
	})

	it('applies a partial patch to the targeted step only', () => {
		const next = updateStep([step(), step({ ordering: 2 })], 2, { enabled: false })
		expect(find(next, 1).enabled).toBe(true)
		expect(find(next, 2).enabled).toBe(false)
	})
})
