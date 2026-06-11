import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { IssueDetail } from './IssueDetail'

const mocks = vi.hoisted(() => ({
	useIssueDetail: vi.fn()
}))

vi.mock('@/hooks/useIssueDetail', () => ({
	useIssueDetail: mocks.useIssueDetail
}))

describe('IssueDetail', () => {
	it('renders a full detail skeleton while the issue is loading', () => {
		mocks.useIssueDetail.mockReturnValue({
			issue: null,
			loading: true,
			error: null,
			refresh: vi.fn()
		})

		render(<IssueDetail issueId="SUP-123" />)

		expect(screen.getByRole('status', { name: /loading issue detail/i })).toBeInTheDocument()
		expect(screen.getByLabelText('Issue rail')).toBeInTheDocument()
	})
})
