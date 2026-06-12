// Pure step-list transforms shared by the Launch Composer store and the
// settings ProfileEditor's local state, so both apply identical clamp /
// reconcile-model semantics (see superkick-core `ReasoningEffort::clamp_for`).
import { clampReasoningForProvider } from '@/lib/launchConfigOptions'
import type { AgentProvider, ProfileStep, SkillDefinition } from '@/types'

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
		executor: skill.default_executor,
		session_policy: skill.default_session_policy,
		output_expectation: skill.default_output_expectation
	}
}

export function reconcileStepProvider(step: ProfileStep, provider: AgentProvider): ProfileStep {
	return {
		...step,
		provider,
		model: provider === step.provider ? step.model : null,
		reasoning: clampReasoningForProvider(step.reasoning, provider)
	}
}

export function defaultStep(ordering: number): ProfileStep {
	return {
		ordering,
		label: 'New step',
		skill_ref: 'implement',
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
