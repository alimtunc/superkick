import type { ReactNode } from 'react'

import type { PrInboxItem } from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ReviewsInbox } from './ReviewsInbox'

vi.mock('@tanstack/react-router', () => ({
	Link: ({ children, ...rest }: { children: ReactNode } & Record<string, unknown>) => {
		const { to: _to, params: _params, ...attrs } = rest
		void _to
		void _params
		return (
			<a href="#" {...(attrs as Record<string, string>)}>
				{children}
			</a>
		)
	}
}))

const mocks = vi.hoisted(() => ({ fetchReviewInbox: vi.fn() }))

vi.mock('@/api', async () => {
	const actual = await vi.importActual<typeof import('@/api')>('@/api')
	return { ...actual, fetchReviewInbox: mocks.fetchReviewInbox }
})

function wrapper() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	return ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	)
}

function pr(overrides: Partial<PrInboxItem>): PrInboxItem {
	return {
		repoSlug: 'acme/superkick',
		number: 1,
		title: 'untitled',
		url: 'https://github.com/acme/superkick/pull/1',
		state: 'open',
		isDraft: false,
		author: 'alim',
		headBranch: 'feature',
		baseBranch: 'main',
		headSha: 'sha',
		reviewers: [],
		reviewCommentCount: 0,
		bucket: 'needs_your_review',
		updatedAt: '2026-06-14T10:00:00Z',
		...overrides
	}
}

const items: PrInboxItem[] = [
	pr({ number: 10, title: 'Open PR needing review', bucket: 'needs_your_review', state: 'open' }),
	pr({ number: 11, title: 'Old merged PR', bucket: 'completed', state: 'merged' })
]

describe('ReviewsInbox', () => {
	beforeEach(() => {
		mocks.fetchReviewInbox.mockReset()
	})

	it('hides completed PRs by default and counts only open ones', async () => {
		mocks.fetchReviewInbox.mockResolvedValue(items)
		render(<ReviewsInbox />, { wrapper: wrapper() })

		expect(await screen.findByText('Open PR needing review')).toBeInTheDocument()
		expect(screen.queryByText('Old merged PR')).toBeNull()
		expect(screen.getByText('1 open')).toBeInTheDocument()
	})

	it('reveals completed PRs behind an explicit toggle', async () => {
		mocks.fetchReviewInbox.mockResolvedValue(items)
		const user = userEvent.setup()
		render(<ReviewsInbox />, { wrapper: wrapper() })

		const toggle = await screen.findByRole('button', { name: /Completed/ })
		expect(screen.queryByText('Old merged PR')).toBeNull()
		await user.click(toggle)
		expect(screen.getByText('Old merged PR')).toBeInTheDocument()
	})
})
