import type { LinearStateType, StatusIconKind } from '@/types'
import { describe, expect, it } from 'vitest'

import { statusIconKindFromLinear } from './statusIcon'

describe('statusIconKindFromLinear', () => {
	it.each<[LinearStateType, StatusIconKind]>([
		['backlog', 'backlog'],
		['unstarted', 'todo'],
		['started', 'progress'],
		['completed', 'done'],
		['canceled', 'cancelled']
	])('maps Linear state %s to %s', (stateType, expected) => {
		expect(statusIconKindFromLinear(stateType)).toBe(expected)
	})
})
