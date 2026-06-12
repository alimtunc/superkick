import type { LaunchProfile } from '@/types'

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
