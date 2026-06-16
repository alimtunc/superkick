// Ephemeral Launch Composer state: the chosen profile + the operator's
// edited working copy of its steps (add/remove/reorder/toggle/override).
import {
	addStep as addStepTo,
	applySkillToStep as applySkillToStepIn,
	moveStep as moveStepIn,
	removeStep as removeStepIn,
	renumberSteps,
	setStepAgent as setStepAgentIn,
	setStepProvider as setStepProviderIn,
	updateStep as updateStepIn
} from '@/lib/stepReducer'
import type { Agent, AgentProvider, LaunchProfile, ProfileStep, SkillDefinition } from '@/types'
import { create } from 'zustand'

interface LaunchComposerState {
	profileId: string | null
	steps: ProfileStep[]
	selectProfile: (profile: LaunchProfile | null) => void
	moveStep: (ordering: number, direction: 'up' | 'down') => void
	removeStep: (ordering: number) => void
	updateStep: (ordering: number, patch: Partial<ProfileStep>) => void
	setStepProvider: (ordering: number, provider: AgentProvider) => void
	setStepAgent: (ordering: number, agent: Agent | null) => void
	applySkillToStep: (ordering: number, skill: SkillDefinition) => void
	addStep: () => void
	reset: () => void
}

export const useLaunchComposerState = create<LaunchComposerState>((set) => ({
	profileId: null,
	steps: [],
	selectProfile: (profile) =>
		set({
			profileId: profile?.id ?? null,
			// Normalise the wire's absent `agent_ref` (server omits `None`) to `null`
			// so the working copy never carries `undefined` on the skill-first path.
			steps: profile
				? renumberSteps(profile.steps.map((step) => ({ ...step, agent_ref: step.agent_ref ?? null })))
				: []
		}),
	moveStep: (ordering, direction) =>
		set((state) => ({ steps: moveStepIn(state.steps, ordering, direction) })),
	removeStep: (ordering) => set((state) => ({ steps: removeStepIn(state.steps, ordering) })),
	updateStep: (ordering, patch) => set((state) => ({ steps: updateStepIn(state.steps, ordering, patch) })),
	setStepProvider: (ordering, provider) =>
		set((state) => ({ steps: setStepProviderIn(state.steps, ordering, provider) })),
	setStepAgent: (ordering, agent) =>
		set((state) => ({ steps: setStepAgentIn(state.steps, ordering, agent) })),
	applySkillToStep: (ordering, skill) =>
		set((state) => ({ steps: applySkillToStepIn(state.steps, ordering, skill) })),
	addStep: () => set((state) => ({ steps: addStepTo(state.steps) })),
	reset: () => set({ profileId: null, steps: [] })
}))
