import type { Agent, LaunchProfile, ProfileStep, ProfileUsage, SkillDefinition } from '@/types'

export function blankProfile(): LaunchProfile {
	return {
		id: '',
		name: '',
		kind: 'custom',
		is_default: false,
		is_readonly: false,
		steps: []
	}
}

// No single-default uniqueness exists server-side: when a profile is saved as
// default we clear the flag on the others client-side before persisting.
export function profilesToClearDefault(profiles: LaunchProfile[], keepId: string): LaunchProfile[] {
	return profiles.filter((profile) => profile.is_default && profile.id !== keepId)
}

// Profiles offered in the launcher selector: operator-hidden ones drop out, but
// the currently-selected profile always stays so the control keeps a value.
export function visibleLaunchProfiles(
	profiles: LaunchProfile[],
	hiddenIds: string[],
	selectedId: string | null
): LaunchProfile[] {
	return profiles.filter((profile) => !hiddenIds.includes(profile.id) || profile.id === selectedId)
}

// One-line warning for a delete confirm dialog when launch profiles reference
// the skill/agent being removed. `null` when nothing references it.
export function profileUsageWarning(usages: ProfileUsage[]): string | null {
	if (usages.length === 0) return null
	const names = usages.map((usage) => usage.name).join(', ')
	const plural = usages.length === 1 ? 'profile' : 'profiles'
	return `Used by ${usages.length} launch ${plural}: ${names}. Those steps will be left unlinked — re-attach them in the profile editor.`
}

// Append the launch-profile usage warning to a delete-confirm description.
export function appendUsageWarning(base: string, usages: ProfileUsage[]): string {
	return [base, profileUsageWarning(usages)].filter(Boolean).join(' ')
}

export interface StepRefIssues {
	skillMissing: boolean
	agentMissing: boolean
}

// Flag a profile step whose skill_ref/agent_ref no longer resolves against the
// live catalogs (e.g. the skill/agent was deleted). Drives the editor's
// "missing" badge so the operator can re-attach a replacement. An empty catalog
// means it is still loading, not that everything is missing — never warn then.
export function stepRefIssues(step: ProfileStep, skills: SkillDefinition[], agents: Agent[]): StepRefIssues {
	return {
		skillMissing: skills.length > 0 && !skills.some((skill) => skill.id === step.skill_ref),
		agentMissing:
			step.agent_ref != null &&
			agents.length > 0 &&
			!agents.some((agent) => agent.name === step.agent_ref)
	}
}
