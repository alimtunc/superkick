// Ephemeral Launch Composer state: the chosen profile + the operator's
// edited working copy of its steps (add/remove/reorder/toggle/override).
import {
	addStep as addStepTo,
	applySkillToStep as applySkillToStepIn,
	moveStep as moveStepIn,
	removeStep as removeStepIn,
	renumberSteps,
	setStepProvider as setStepProviderIn,
	updateStep as updateStepIn
} from '@/lib/stepReducer'
import type { AgentProvider, LaunchProfile, ProfileStep, SkillDefinition } from '@/types'
import { create } from 'zustand'

interface LaunchComposerState {
	profileId: string | null
	steps: ProfileStep[]
	selectProfile: (profile: LaunchProfile | null) => void
	moveStep: (ordering: number, direction: 'up' | 'down') => void
	removeStep: (ordering: number) => void
	updateStep: (ordering: number, patch: Partial<ProfileStep>) => void
	setStepProvider: (ordering: number, provider: AgentProvider) => void
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
			steps: profile ? renumberSteps(profile.steps.map((step) => ({ ...step }))) : []
		}),
	moveStep: (ordering, direction) =>
		set((state) => ({ steps: moveStepIn(state.steps, ordering, direction) })),
	removeStep: (ordering) => set((state) => ({ steps: removeStepIn(state.steps, ordering) })),
	updateStep: (ordering, patch) => set((state) => ({ steps: updateStepIn(state.steps, ordering, patch) })),
	setStepProvider: (ordering, provider) =>
		set((state) => ({ steps: setStepProviderIn(state.steps, ordering, provider) })),
	applySkillToStep: (ordering, skill) =>
		set((state) => ({ steps: applySkillToStepIn(state.steps, ordering, skill) })),
	addStep: () => set((state) => ({ steps: addStepTo(state.steps) })),
	reset: () => set({ profileId: null, steps: [] })
}))
