import { IssueReplyComposer } from '@/components/issue-detail/IssueReplyComposer'
import type { ViewerResponse } from '@/types'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const viewerMock = vi.hoisted(() => ({
	current: null as ViewerResponse | null
}))

vi.mock('@/hooks/useViewer', () => ({
	useViewer: () => ({
		viewerId: viewerMock.current?.id ?? null,
		viewer: viewerMock.current,
		loading: false
	})
}))

afterEach(() => {
	viewerMock.current = null
})

describe('IssueReplyComposer', () => {
	it('renders the production comment affordance, disabled, with no follow-up scaffold copy', () => {
		render(<IssueReplyComposer />)

		const textarea = screen.getByLabelText('Leave a comment') as HTMLTextAreaElement
		expect(textarea).toBeDisabled()
		expect(textarea).toHaveAttribute('placeholder', 'Leave a comment…')

		const commentBtn = screen.getByRole('button', { name: 'Comment' })
		expect(commentBtn).toBeDisabled()

		expect(screen.queryByText(/follow-up/i)).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Attach file' })).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Attach link' })).toBeInTheDocument()
	})

	it('renders the viewer initials when a viewer is loaded', () => {
		viewerMock.current = { id: 'u1', name: 'Léa Martin', avatar_url: null }
		render(<IssueReplyComposer />)

		expect(screen.getByText('LM')).toBeInTheDocument()
	})
})
