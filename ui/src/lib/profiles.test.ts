import { profilesToClearDefault } from '@/lib/profiles'
import type { LaunchProfile } from '@/types'
import { describe, expect, it } from 'vitest'

function profile(overrides: Partial<LaunchProfile> = {}): LaunchProfile {
	return {
		id: 'p1',
		name: 'Profile',
		kind: 'custom',
		is_default: false,
		is_readonly: false,
		steps: [],
		...overrides
	}
}

describe('profilesToClearDefault', () => {
	it('returns every other default profile so they can be cleared', () => {
		const profiles = [
			profile({ id: 'a', is_default: true }),
			profile({ id: 'b', is_default: true }),
			profile({ id: 'c', is_default: false })
		]
		const cleared = profilesToClearDefault(profiles, 'a')
		expect(cleared.map((p) => p.id)).toEqual(['b'])
	})

	it('excludes the kept profile even when it is default', () => {
		const profiles = [profile({ id: 'a', is_default: true })]
		expect(profilesToClearDefault(profiles, 'a')).toEqual([])
	})

	it('returns nothing when no other profile is default', () => {
		const profiles = [profile({ id: 'a', is_default: false }), profile({ id: 'b', is_default: false })]
		expect(profilesToClearDefault(profiles, 'a')).toEqual([])
	})
})
