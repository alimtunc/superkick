import { useLaunchComposerState } from '@/stores/launchComposerState'
import type { Agent, LaunchProfile, ProfileStep, SkillDefinition } from '@/types'
import { afterEach, describe, expect, it } from 'vitest'

function step(overrides: Partial<ProfileStep> = {}): ProfileStep {
	return {
		ordering: 1,
		label: 'Implement',
		skill_ref: 'implement',
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

function profile(steps: ProfileStep[]): LaunchProfile {
	return {
		id: 'profile-1',
		name: 'Standard',
		kind: 'standard',
		is_default: true,
		is_readonly: false,
		steps
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
		name: 'team-coder',
		provider: 'claude',
		role: 'coder',
		model: 'claude-opus-4-8',
		runner_mode: 'interactive_pty',
		executor: 'interactive_pty',
		default_reasoning: 'high',
		billing_profile: 'subscription',
		origin: 'custom',
		enabled: true,
		avatar: null,
		description: null,
		...overrides
	}
}

function currentStep(ordering: number): ProfileStep {
	const found = useLaunchComposerState.getState().steps.find((s) => s.ordering === ordering)
	if (!found) throw new Error(`no step with ordering ${ordering}`)
	return found
}

afterEach(() => {
	useLaunchComposerState.getState().reset()
})

describe('applySkillToStep', () => {
	it('seeds the step from the skill defaults', () => {
		useLaunchComposerState.getState().selectProfile(profile([step({ model: 'gpt-5-codex' })]))

		useLaunchComposerState.getState().applySkillToStep(1, skill({ default_model: 'claude-opus-4-8' }))

		expect(currentStep(1)).toMatchObject({
			skill_ref: 'ticket',
			label: 'Ticket (A→Z)',
			provider: 'claude',
			model: 'claude-opus-4-8',
			reasoning: 'high',
			executor: 'interactive_pty',
			session_policy: 'fresh',
			output_expectation: 'patch'
		})
	})

	it('clears the step model when the skill flips the provider without a default_model', () => {
		useLaunchComposerState
			.getState()
			.selectProfile(profile([step({ provider: 'codex', model: 'gpt-5-codex' })]))

		useLaunchComposerState
			.getState()
			.applySkillToStep(1, skill({ default_provider: 'claude', default_model: undefined }))

		expect(currentStep(1)).toMatchObject({ provider: 'claude', model: null })
	})

	it('keeps the step model when the skill targets the same provider without a default_model', () => {
		useLaunchComposerState
			.getState()
			.selectProfile(profile([step({ provider: 'claude', model: 'claude-opus-4-8' })]))

		useLaunchComposerState
			.getState()
			.applySkillToStep(1, skill({ default_provider: 'claude', default_model: undefined }))

		expect(currentStep(1).model).toBe('claude-opus-4-8')
	})

	it('clamps the skill default reasoning to its default provider', () => {
		useLaunchComposerState.getState().selectProfile(profile([step()]))

		useLaunchComposerState
			.getState()
			.applySkillToStep(1, skill({ default_provider: 'codex', default_reasoning: 'max' }))

		expect(currentStep(1).reasoning).toBe('xhigh')
	})

	it('does not touch other steps', () => {
		useLaunchComposerState
			.getState()
			.selectProfile(profile([step(), step({ ordering: 2, label: 'Review', skill_ref: 'review' })]))

		useLaunchComposerState.getState().applySkillToStep(1, skill())

		expect(currentStep(2).skill_ref).toBe('review')
	})
})

describe('setStepProvider', () => {
	it('clamps max to xhigh when switching to codex', () => {
		useLaunchComposerState
			.getState()
			.selectProfile(profile([step({ provider: 'claude', reasoning: 'max' })]))

		useLaunchComposerState.getState().setStepProvider(1, 'codex')

		expect(currentStep(1)).toMatchObject({ provider: 'codex', reasoning: 'xhigh' })
	})

	it('clamps minimal to low when switching to claude', () => {
		useLaunchComposerState
			.getState()
			.selectProfile(profile([step({ provider: 'codex', reasoning: 'minimal' })]))

		useLaunchComposerState.getState().setStepProvider(1, 'claude')

		expect(currentStep(1)).toMatchObject({ provider: 'claude', reasoning: 'low' })
	})

	it('keeps reasoning untouched when valid for the new provider', () => {
		useLaunchComposerState
			.getState()
			.selectProfile(profile([step({ provider: 'codex', reasoning: 'medium' })]))

		useLaunchComposerState.getState().setStepProvider(1, 'claude')

		expect(currentStep(1)).toMatchObject({ provider: 'claude', reasoning: 'medium' })
	})

	it('clears the model when switching to another provider', () => {
		useLaunchComposerState
			.getState()
			.selectProfile(profile([step({ provider: 'codex', model: 'gpt-5-codex' })]))

		useLaunchComposerState.getState().setStepProvider(1, 'claude')

		expect(currentStep(1)).toMatchObject({ provider: 'claude', model: null })
	})

	it('keeps the model when re-selecting the same provider', () => {
		useLaunchComposerState
			.getState()
			.selectProfile(profile([step({ provider: 'codex', model: 'gpt-5-codex' })]))

		useLaunchComposerState.getState().setStepProvider(1, 'codex')

		expect(currentStep(1).model).toBe('gpt-5-codex')
	})
})

describe('setStepAgent', () => {
	it('attaches the agent and seeds the step fields', () => {
		useLaunchComposerState
			.getState()
			.selectProfile(profile([step({ provider: 'codex', model: 'gpt-5-codex' })]))

		useLaunchComposerState.getState().setStepAgent(1, agent())

		expect(currentStep(1)).toMatchObject({
			agent_ref: 'team-coder',
			provider: 'claude',
			model: 'claude-opus-4-8',
			reasoning: 'high',
			executor: 'interactive_pty'
		})
	})

	it('clears the agent and reverts to the skill-first path', () => {
		useLaunchComposerState.getState().selectProfile(profile([step()]))

		useLaunchComposerState.getState().setStepAgent(1, agent())
		useLaunchComposerState.getState().setStepAgent(1, null)

		expect(currentStep(1).agent_ref).toBeNull()
		expect(currentStep(1).skill_ref).toBe('implement')
	})
})
