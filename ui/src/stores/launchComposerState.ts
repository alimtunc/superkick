// Ephemeral Launch Composer state: the chosen profile + the operator's
// edited working copy of its steps (add/remove/reorder/toggle/override).
import type { LaunchProfile, ProfileStep } from '@/types'
import { create } from 'zustand'

interface LaunchComposerState {
	profileId: string | null
	steps: ProfileStep[]
	selectProfile: (profile: LaunchProfile | null) => void
	toggleStep: (ordering: number) => void
	moveStep: (ordering: number, direction: 'up' | 'down') => void
	removeStep: (ordering: number) => void
	updateStep: (ordering: number, patch: Partial<ProfileStep>) => void
	addStep: () => void
	reset: () => void
}

function renumber(steps: ProfileStep[]): ProfileStep[] {
	return steps.map((step, index) => ({ ...step, ordering: index + 1 }))
}

function reorder(steps: ProfileStep[], ordering: number, direction: 'up' | 'down'): ProfileStep[] {
	const sorted = steps.toSorted((a, b) => a.ordering - b.ordering)
	const index = sorted.findIndex((step) => step.ordering === ordering)
	const target = direction === 'up' ? index - 1 : index + 1
	if (index === -1 || target < 0 || target >= sorted.length) return steps
	const tmp = sorted[index]
	sorted[index] = sorted[target]
	sorted[target] = tmp
	return renumber(sorted)
}

function defaultStep(ordering: number): ProfileStep {
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

export const useLaunchComposerState = create<LaunchComposerState>((set) => ({
	profileId: null,
	steps: [],
	selectProfile: (profile) =>
		set({
			profileId: profile?.id ?? null,
			steps: profile ? renumber(profile.steps.map((step) => ({ ...step }))) : []
		}),
	toggleStep: (ordering) =>
		set((state) => ({
			steps: state.steps.map((step) =>
				step.ordering === ordering ? { ...step, enabled: !step.enabled } : step
			)
		})),
	moveStep: (ordering, direction) => set((state) => ({ steps: reorder(state.steps, ordering, direction) })),
	removeStep: (ordering) =>
		set((state) => ({ steps: renumber(state.steps.filter((step) => step.ordering !== ordering)) })),
	updateStep: (ordering, patch) =>
		set((state) => ({
			steps: state.steps.map((step) => (step.ordering === ordering ? { ...step, ...patch } : step))
		})),
	addStep: () => set((state) => ({ steps: [...state.steps, defaultStep(state.steps.length + 1)] })),
	reset: () => set({ profileId: null, steps: [] })
}))
