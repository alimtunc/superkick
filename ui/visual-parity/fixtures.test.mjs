import { describe, expect, it } from 'vitest'

import { responseForFixture } from './fixtures.mjs'

describe('visual parity fixtures', () => {
	it('keeps the issue-detail idle state free of launch tasks', () => {
		const response = responseForFixture(
			'issue-idle',
			'http://visual-parity.local/api/launch-tasks?linear_issue_id=ISS-216'
		)

		expect(response).toEqual([])
	})
})
