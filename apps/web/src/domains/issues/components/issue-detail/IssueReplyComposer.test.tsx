import type { ReactNode } from 'react'

import { IssueReplyComposer } from '@/domains/issues/components/issue-detail/IssueReplyComposer'
import type { ViewerResponse } from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

vi.mock('sonner', () => ({
	toast: {
		error: vi.fn(),
		info: vi.fn(),
		success: vi.fn()
	}
}))

function wrapper(client: QueryClient) {
	return ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	)
}

beforeEach(() => {
	fetchMock.mockReset()
})

afterEach(() => {
	viewerMock.current = null
	vi.clearAllMocks()
})

describe('IssueReplyComposer', () => {
	it('renders an enabled textarea with the Comment button disabled until text is entered', () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		render(<IssueReplyComposer issueId="issue-1" />, { wrapper: wrapper(client) })

		const textarea = screen.getByLabelText('Leave a comment') as HTMLTextAreaElement
		expect(textarea).not.toBeDisabled()
		expect(textarea).toHaveAttribute('placeholder', 'Leave a comment…')

		expect(screen.getByRole('button', { name: 'Comment' })).toBeDisabled()
		expect(screen.queryByRole('button', { name: 'Attach file' })).not.toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Attach link' })).not.toBeInTheDocument()
	})

	it('renders the viewer initials when a viewer is loaded', () => {
		viewerMock.current = { id: 'u1', name: 'Léa Martin', avatar_url: null }
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		render(<IssueReplyComposer issueId="issue-1" />, { wrapper: wrapper(client) })

		expect(screen.getByText('LM')).toBeInTheDocument()
	})

	it('submits via ⌘+Enter and clears the textarea on success', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					id: 'c1',
					body: 'hello',
					author: null,
					created_at: '2026-05-27T10:00:00Z',
					updated_at: '2026-05-27T10:00:00Z',
					parent_id: null
				}),
				{ status: 201, headers: { 'Content-Type': 'application/json' } }
			)
		)

		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		const user = userEvent.setup()
		render(<IssueReplyComposer issueId="issue-1" />, { wrapper: wrapper(client) })

		const textarea = screen.getByLabelText('Leave a comment') as HTMLTextAreaElement
		await user.type(textarea, 'hello')
		await user.keyboard('{Meta>}{Enter}{/Meta}')

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
		const [url, init] = fetchMock.mock.calls[0]
		expect(url).toBe('/api/issues/issue-1/comments')
		expect((init as RequestInit).method).toBe('POST')
		expect(JSON.parse(String((init as RequestInit).body))).toEqual({ body: 'hello' })

		await waitFor(() => expect(textarea.value).toBe(''))
	})

	it('keeps the typed text when posting fails', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: 'Body must not be empty' }), {
				status: 422,
				headers: { 'Content-Type': 'application/json' }
			})
		)

		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		const user = userEvent.setup()
		render(<IssueReplyComposer issueId="issue-1" />, { wrapper: wrapper(client) })

		const textarea = screen.getByLabelText('Leave a comment') as HTMLTextAreaElement
		await user.type(textarea, 'nope')
		await user.click(screen.getByRole('button', { name: 'Comment' }))

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
		expect(textarea.value).toBe('nope')
	})
})
