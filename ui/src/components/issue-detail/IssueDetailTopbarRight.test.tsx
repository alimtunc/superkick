import type { ReactNode } from 'react'

import { IssueDetailTopbarRight } from '@/components/issue-detail/IssueDetailTopbarRight'
import type { IssueDetailResponse } from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() })
}))

vi.mock('sonner', () => ({ toast: mocks.toast }))

vi.mock('@/components/launch/LaunchComposerDialog', () => ({
	LaunchComposerDialog: ({ open }: { open: boolean }) =>
		open ? <div data-testid="launch-composer-dialog" /> : null
}))

afterEach(() => {
	mocks.toast.mockReset()
	mocks.toast.error.mockReset()
	mocks.toast.success.mockReset()
})

const issue = {
	id: 'uuid-176',
	identifier: 'SUP-176',
	title: 'Test issue'
} as unknown as IssueDetailResponse

function wrapper({ children }: { children: ReactNode }) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function renderCluster({
	onRefresh = vi.fn(),
	isDone = false
}: { onRefresh?: () => void; isDone?: boolean } = {}) {
	const user = userEvent.setup()
	return {
		user,
		onRefresh,
		...render(<IssueDetailTopbarRight issue={issue} isDone={isDone} onRefresh={onRefresh} />, {
			wrapper
		})
	}
}

describe('IssueDetailTopbarRight', () => {
	it('fires onRefresh from the direct refresh button', async () => {
		const { user, onRefresh } = renderCluster()
		await user.click(screen.getByRole('button', { name: 'Refresh issue data' }))
		expect(onRefresh).toHaveBeenCalledTimes(1)
	})

	it('opens the launch composer dialog on Launch task', async () => {
		const { user } = renderCluster()
		expect(screen.queryByTestId('launch-composer-dialog')).not.toBeInTheDocument()
		await user.click(screen.getByRole('button', { name: 'Launch task for SUP-176' }))
		expect(await screen.findByTestId('launch-composer-dialog')).toBeInTheDocument()
	})

	it('relabels the primary action as Re-launch when the issue is done', () => {
		renderCluster({ isDone: true })
		expect(screen.getByRole('button', { name: 'Re-launch task for SUP-176' })).toBeInTheDocument()
	})

	it('exposes Clean issue actions through the More menu', async () => {
		const { user } = renderCluster()
		await user.click(screen.getByRole('button', { name: 'More actions' }))
		expect(await screen.findByRole('menuitem', { name: /clean issue \(archive\)/i })).toBeInTheDocument()
		expect(screen.getByRole('menuitem', { name: /purge runs & tasks/i })).toBeInTheDocument()
	})
})
