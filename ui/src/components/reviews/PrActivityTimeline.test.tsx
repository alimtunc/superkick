import type { ReactNode } from 'react'

import type { PrActivityEvent } from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PrActivityTimeline } from './PrActivityTimeline'

const mocks = vi.hoisted(() => ({ fetchPrActivity: vi.fn() }))

vi.mock('@/api', async () => {
	const actual = await vi.importActual<typeof import('@/api')>('@/api')
	return { ...actual, fetchPrActivity: mocks.fetchPrActivity }
})

function wrapper() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	return ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	)
}

const events: PrActivityEvent[] = [
	{ kind: 'opened', actor: 'alim', createdAt: '2026-06-10T09:00:00Z' },
	{
		kind: 'review_submitted',
		actor: 'copilot',
		body: '<!-- copilot:tracking secret-token -->\nReview complete. Not **LGTM**.',
		decision: 'commented',
		createdAt: '2026-06-11T09:00:00Z'
	},
	{
		kind: 'commented',
		actor: 'bob',
		body: '<details><summary>Show a summary per file</summary>plain note here</details>',
		createdAt: '2026-06-12T09:00:00Z'
	}
]

describe('PrActivityTimeline', () => {
	beforeEach(() => {
		mocks.fetchPrActivity.mockReset()
	})

	it('renders light system events and clean comment cards with bot HTML stripped', async () => {
		mocks.fetchPrActivity.mockResolvedValue(events)
		const { container } = render(<PrActivityTimeline number={7} headSha="abc" />, { wrapper: wrapper() })

		// system event, not a card
		expect(await screen.findByText(/opened this pull request/)).toBeInTheDocument()

		// bot review body is readable, with the HTML comment wrapper removed
		expect(screen.getByText(/Review complete/)).toBeInTheDocument()
		expect(screen.queryByText(/secret-token/)).toBeNull()

		// <details>/<summary> noise stripped, inner prose kept
		expect(screen.getByText(/plain note here/)).toBeInTheDocument()
		expect(screen.queryByText(/Show a summary per file/)).toBeNull()

		expect(container.textContent).not.toContain('<!--')
		expect(container.textContent).not.toContain('<summary>')
	})

	it('shows a discreet empty state when there is no activity', async () => {
		mocks.fetchPrActivity.mockResolvedValue([])
		render(<PrActivityTimeline number={7} headSha="abc" />, { wrapper: wrapper() })
		expect(await screen.findByText('No activity yet')).toBeInTheDocument()
	})
})
