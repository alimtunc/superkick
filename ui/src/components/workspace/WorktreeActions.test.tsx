import type { ReactNode } from 'react'

import { WorktreeActions } from '@/components/workspace/WorktreeActions'
import type { OpenedTakeover } from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	openTakeover: vi.fn()
}))

vi.mock('@/api/terminalTakeover', async () => {
	const actual = await vi.importActual<typeof import('@/api/terminalTakeover')>('@/api/terminalTakeover')
	return {
		...actual,
		openTakeover: mocks.openTakeover
	}
})

vi.mock('sonner', () => ({
	toast: Object.assign(vi.fn(), {
		error: vi.fn()
	})
}))

const WORKTREE = '/Users/op/Developement/Side/superkick/.worktrees/sup-152-structured-activity-feed'
const BRANCH = 'alimtunc/sup-152-structured-activity-feed-step-timeline-evidence-summary'
const RUN_ID = 'run-1'

function wrap(node: ReactNode) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
	})
	return <QueryClientProvider client={client}>{node}</QueryClientProvider>
}

describe('WorktreeActions', () => {
	beforeEach(() => {
		mocks.openTakeover.mockReset()
	})

	it('renders the worktree path and branch when both are present', () => {
		render(wrap(<WorktreeActions runId={RUN_ID} worktreePath={WORKTREE} branchName={BRANCH} />))
		expect(screen.getByText('Worktree')).toBeInTheDocument()
		expect(screen.getByText(BRANCH)).toBeInTheDocument()
		expect(screen.getByRole('button', { name: /open terminal here/i })).toBeInTheDocument()
	})

	it('renders the empty state when worktreePath is null', () => {
		render(wrap(<WorktreeActions runId={RUN_ID} worktreePath={null} branchName={null} />))
		expect(screen.getByText(/no worktree yet/i)).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: /open terminal here/i })).not.toBeInTheDocument()
	})

	it('copies the absolute worktree path to the clipboard when the path button is clicked', async () => {
		const user = userEvent.setup()
		const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
		render(wrap(<WorktreeActions runId={RUN_ID} worktreePath={WORKTREE} branchName={BRANCH} />))

		const copyButton = screen.getAllByRole('button').find((btn) => btn.getAttribute('title') === WORKTREE)
		expect(copyButton).toBeDefined()
		if (!copyButton) throw new Error('copy button not found')

		await user.click(copyButton)
		expect(writeText).toHaveBeenCalledWith(WORKTREE)
	})

	it('opens an inspect takeover when "Open terminal here" is clicked', async () => {
		const opened: OpenedTakeover = {
			takeover_session_id: 'tk-1',
			mode: 'inspect',
			resume_attempted: false,
			terminal_ws: 'ws://example/api/runs/run-1/terminal/tk-1'
		}
		mocks.openTakeover.mockResolvedValue(opened)

		const user = userEvent.setup()
		render(wrap(<WorktreeActions runId={RUN_ID} worktreePath={WORKTREE} branchName={BRANCH} />))

		await user.click(screen.getByRole('button', { name: /open terminal here/i }))

		await waitFor(() => {
			expect(mocks.openTakeover).toHaveBeenCalledWith(RUN_ID, { mode: 'inspect' })
		})
	})
})
