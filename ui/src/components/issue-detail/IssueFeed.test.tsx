import type { ReactNode } from 'react'

import { IssueFeed } from '@/components/issue-detail/IssueFeed'
import type { IssueDetailResponse, LinkedRunSummary } from '@/types'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	openDrawer: vi.fn()
}))

vi.mock('@/stores/runDrawer', () => ({
	useRunDrawerStore: (selector: (state: { openDrawer: typeof mocks.openDrawer }) => unknown) =>
		selector({ openDrawer: mocks.openDrawer })
}))

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

// IssueIntro / IssueMarkdown render rich pieces that need their own fixtures.
// We stub the intro because the feed-level behaviour we care about is the
// drawer wiring on the activity rows.
vi.mock('@/components/issue-detail/IssueIntro', () => ({
	IssueIntro: () => <div data-testid="issue-intro" />
}))

function needsHumanRun(id: string): LinkedRunSummary {
	return {
		id,
		state: 'waiting_human',
		started_at: '2026-05-25T10:00:00.000Z',
		finished_at: null
	}
}

function completedRun(id: string): LinkedRunSummary {
	return {
		id,
		state: 'completed',
		started_at: '2026-05-25T09:00:00.000Z',
		finished_at: '2026-05-25T09:30:00.000Z'
	}
}

function buildIssue(linkedRuns: LinkedRunSummary[]): IssueDetailResponse {
	return {
		identifier: 'SUP-178',
		linked_runs: linkedRuns,
		comments: []
	} as unknown as IssueDetailResponse
}

beforeEach(() => {
	mocks.openDrawer.mockReset()
})

describe('IssueFeed — drawer-first run navigation', () => {
	it('opens the drawer (not /runs/:id) when clicking Open run on a needs-human row', async () => {
		render(<IssueFeed issue={buildIssue([needsHumanRun('run-nh')])} />)
		const user = userEvent.setup()

		const open = screen.getByRole('button', { name: /open run/i })
		await user.click(open)

		expect(mocks.openDrawer).toHaveBeenCalledWith('run-nh', 'activity')
	})

	it('opens the drawer on a terminal run row, and keeps a secondary deep link to /runs/:id', async () => {
		render(<IssueFeed issue={buildIssue([completedRun('run-done')])} />)
		const user = userEvent.setup()

		const open = screen.getByRole('button', { name: /open run/i })
		await user.click(open)

		expect(mocks.openDrawer).toHaveBeenCalledWith('run-done', 'activity')
		expect(screen.getByRole('link', { name: /open run detail page/i })).toBeInTheDocument()
	})
})
