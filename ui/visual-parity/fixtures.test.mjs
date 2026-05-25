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

	it('resolves /issues detail for ISS-216 by identifier and internal id (SUP-175)', () => {
		const byIdentifier = responseForFixture(
			'issue-running',
			'http://visual-parity.local/api/issues/ISS-216'
		)
		const byInternalId = responseForFixture(
			'issue-running',
			'http://visual-parity.local/api/issues/issue-iss-216'
		)

		expect(byIdentifier, 'hover preview fetches detail by identifier').not.toBeNull()
		expect(byInternalId, 'hover preview fetches detail by internal id').not.toBeNull()
		expect(byIdentifier?.identifier).toBe('ISS-216')
		expect(byInternalId?.identifier).toBe('ISS-216')
	})
})
