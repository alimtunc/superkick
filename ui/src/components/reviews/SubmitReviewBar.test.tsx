import type { ReactNode } from 'react'

import { SubmitReviewBar } from '@/components/reviews/SubmitReviewBar'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	submitPrReview: vi.fn()
}))

vi.mock('@/api', async () => {
	const actual = await vi.importActual<typeof import('@/api')>('@/api')
	return { ...actual, submitPrReview: mocks.submitPrReview }
})

function wrapper() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	return ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	)
}

describe('SubmitReviewBar', () => {
	beforeEach(() => {
		mocks.submitPrReview.mockReset()
	})

	it('submits the chosen event + body and reports anchored/fallback counts', async () => {
		mocks.submitPrReview.mockResolvedValue({ anchoredComments: 2, fallbackComments: 1 })
		const user = userEvent.setup()
		render(<SubmitReviewBar number={7} headSha="abc" unresolvedCount={3} />, { wrapper: wrapper() })

		await user.click(screen.getByRole('radio', { name: 'Request changes' }))
		await user.type(screen.getByPlaceholderText(/required/i), 'Please address these')
		await user.click(screen.getByRole('button', { name: 'Submit review' }))

		await waitFor(() => {
			expect(mocks.submitPrReview).toHaveBeenCalledWith(7, {
				headSha: 'abc',
				event: 'request_changes',
				body: 'Please address these'
			})
		})
		expect(await screen.findByRole('status')).toHaveTextContent('2 inline')
		expect(screen.getByRole('status')).toHaveTextContent('1 added to the summary')
	})

	it('surfaces a submit failure without clearing intent', async () => {
		mocks.submitPrReview.mockRejectedValue(new Error('GitHub CLI is not authenticated'))
		const user = userEvent.setup()
		render(<SubmitReviewBar number={9} headSha="def" unresolvedCount={1} />, { wrapper: wrapper() })

		await user.click(screen.getByRole('button', { name: 'Submit review' }))

		expect(await screen.findByRole('alert')).toHaveTextContent('GitHub CLI is not authenticated')
	})
})
