import { IssueDetailTopbarRight } from '@/components/issue-detail/IssueDetailTopbarRight'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	useNavigate: vi.fn(),
	toast: Object.assign(vi.fn(), { error: vi.fn() })
}))

vi.mock('@tanstack/react-router', async () => {
	const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
	return { ...actual, useNavigate: mocks.useNavigate }
})

vi.mock('sonner', () => ({ toast: mocks.toast }))

afterEach(() => {
	mocks.navigate.mockReset()
	mocks.useNavigate.mockReset()
	mocks.toast.mockReset()
	mocks.toast.error.mockReset()
})

function renderCluster(onRefresh = vi.fn()) {
	const user = userEvent.setup()
	const writeText = vi.fn<(value: string) => Promise<void>>()
	Object.defineProperty(navigator, 'clipboard', {
		configurable: true,
		value: { writeText }
	})
	mocks.useNavigate.mockReturnValue(mocks.navigate)
	return {
		user,
		writeText,
		onRefresh,
		...render(<IssueDetailTopbarRight identifier="SUP-176" onRefresh={onRefresh} />)
	}
}

describe('IssueDetailTopbarRight', () => {
	it('copies the page URL and surfaces a success toast on copy-link', async () => {
		const { user, writeText } = renderCluster()
		writeText.mockResolvedValue(undefined)

		await user.click(screen.getByRole('button', { name: 'Copy link to this issue' }))

		expect(writeText).toHaveBeenCalledWith(window.location.href)
		expect(mocks.toast).toHaveBeenCalledWith('Link copied')
	})

	it('surfaces an error toast when clipboard write rejects', async () => {
		const { user, writeText } = renderCluster()
		writeText.mockRejectedValue(new Error('denied'))

		await user.click(screen.getByRole('button', { name: 'Copy link to this issue' }))

		expect(mocks.toast.error).toHaveBeenCalledWith('Failed to copy link')
	})

	it('exposes Refresh through the More menu and fires onRefresh when selected', async () => {
		const { user, onRefresh } = renderCluster()

		expect(screen.queryByRole('menuitem', { name: /refresh/i })).not.toBeInTheDocument()

		await user.click(screen.getByRole('button', { name: 'More actions' }))
		const refresh = await screen.findByRole('menuitem', { name: /refresh issue data/i })

		await user.click(refresh)
		expect(onRefresh).toHaveBeenCalledTimes(1)
	})

	it('navigates to /tasks/new with the issue identifier on Launch task', async () => {
		const { user } = renderCluster()
		await user.click(screen.getByRole('button', { name: 'Launch task for SUP-176' }))
		expect(mocks.navigate).toHaveBeenCalledWith({
			to: '/tasks/new',
			search: { issue: 'SUP-176' }
		})
	})
})
