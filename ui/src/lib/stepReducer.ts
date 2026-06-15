// Pure step-list transforms shared by the Launch Composer store and the
// settings ProfileEditor's local state, so both apply identical clamp /
// reconcile-model semantics (see superkick-core `ReasoningEffort::clamp_for`).
import { clampExecutorForProvider, clampReasoningForProvider } from '@/lib/launchConfigOptions'
import type { Agent, AgentProvider, ProfileStep, SkillDefinition } from '@/types'

export function renumberSteps(steps: ProfileStep[]): ProfileStep[] {
	return steps.map((step, index) => ({ ...step, ordering: index + 1 }))
}

export function seedStepFromSkill(step: ProfileStep, skill: SkillDefinition): ProfileStep {
	return {
		...step,
		skill_ref: skill.id,
		label: skill.label,
		provider: skill.default_provider,
		model: skill.default_model ?? (skill.default_provider === step.provider ? step.model : null),
		reasoning: clampReasoningForProvider(skill.default_reasoning, skill.default_provider),
		executor: clampExecutorForProvider(skill.default_executor, skill.default_provider),
		session_policy: skill.default_session_policy,
		output_expectation: skill.default_output_expectation
	}
}

// Attach an agent as the step's primary unit: record `agent_ref` and seed the
// displayed fields from it (the agent's policy deep-carries at launch).
export function seedStepFromAgent(step: ProfileStep, agent: Agent): ProfileStep {
	return {
		...step,
		agent_ref: agent.name,
		provider: agent.provider,
		model: agent.model ?? (agent.provider === step.provider ? step.model : null),
		reasoning: clampReasoningForProvider(agent.default_reasoning, agent.provider),
		executor: clampExecutorForProvider(agent.executor, agent.provider)
	}
}

export function reconcileStepProvider(step: ProfileStep, provider: AgentProvider): ProfileStep {
	return {
		...step,
		provider,
		model: provider === step.provider ? step.model : null,
		reasoning: clampReasoningForProvider(step.reasoning, provider),
		executor: clampExecutorForProvider(step.executor, provider)
	}
}

export function defaultStep(ordering: number): ProfileStep {
	return {
		ordering,
		label: 'New step',
		skill_ref: 'implement',
		agent_ref: null,
		provider: 'codex',
		model: null,
		reasoning: 'medium',
		executor: 'codex_structured',
		session_policy: 'fresh',
		output_expectation: 'patch',
		enabled: true
	}
}

export function moveStep(steps: ProfileStep[], ordering: number, direction: 'up' | 'down'): ProfileStep[] {
	const sorted = steps.toSorted((a, b) => a.ordering - b.ordering)
	const index = sorted.findIndex((step) => step.ordering === ordering)
	const target = direction === 'up' ? index - 1 : index + 1
	if (index === -1 || target < 0 || target >= sorted.length) return steps
	const tmp = sorted[index]
	sorted[index] = sorted[target]
	sorted[target] = tmp
	return renumberSteps(sorted)
}

export function removeStep(steps: ProfileStep[], ordering: number): ProfileStep[] {
	return renumberSteps(steps.filter((step) => step.ordering !== ordering))
}

export function addStep(steps: ProfileStep[]): ProfileStep[] {
	return [...steps, defaultStep(steps.length + 1)]
}

export function updateStep(
	steps: ProfileStep[],
	ordering: number,
	patch: Partial<ProfileStep>
): ProfileStep[] {
	return steps.map((step) => (step.ordering === ordering ? { ...step, ...patch } : step))
}

export function applySkillToStep(
	steps: ProfileStep[],
	ordering: number,
	skill: SkillDefinition
): ProfileStep[] {
	return steps.map((step) => (step.ordering === ordering ? seedStepFromSkill(step, skill) : step))
}

export function setStepProvider(
	steps: ProfileStep[],
	ordering: number,
	provider: AgentProvider
): ProfileStep[] {
	return steps.map((step) => (step.ordering === ordering ? reconcileStepProvider(step, provider) : step))
}

// Attach (`agent` set) or clear (`null`) the per-step agent. Clearing reverts
// the step to the skill-first path by dropping `agent_ref`; the other fields are
// left as the operator last saw them.
export function setStepAgent(steps: ProfileStep[], ordering: number, agent: Agent | null): ProfileStep[] {
	return steps.map((step) => {
		if (step.ordering !== ordering) return step
		return agent ? seedStepFromAgent(step, agent) : { ...step, agent_ref: null }
	})
}
