import type { ReactNode } from 'react'

import { IssueFeed } from '@/components/issue-detail/IssueFeed'
import type { IssueComment, IssueDetailResponse, LinkedPrSummary, LinkedRunSummary } from '@/types'
import { render, screen, within } from '@testing-library/react'
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

function completedRun(id: string, pr?: LinkedPrSummary): LinkedRunSummary {
	return {
		id,
		state: 'completed',
		started_at: '2026-05-25T09:00:00.000Z',
		finished_at: '2026-05-25T09:30:00.000Z',
		pr
	}
}

function comment(overrides: Pick<IssueComment, 'id' | 'body' | 'created_at'>): IssueComment {
	return {
		id: overrides.id,
		body: overrides.body,
		author: { id: 'u-alice', name: 'Alice Example', avatar_url: null },
		created_at: overrides.created_at,
		updated_at: overrides.created_at,
		parent_id: null
	}
}

function buildIssue({
	linkedRuns = [],
	comments = []
}: { linkedRuns?: LinkedRunSummary[]; comments?: IssueComment[] } = {}): IssueDetailResponse {
	return {
		identifier: 'SUP-173',
		linked_runs: linkedRuns,
		comments
	} as unknown as IssueDetailResponse
}

beforeEach(() => {
	mocks.openDrawer.mockReset()
})

describe('IssueFeed — drawer-first run navigation', () => {
	it('opens the drawer (not /runs/:id) when clicking Open run on the needs-human callout', async () => {
		render(<IssueFeed issue={buildIssue({ linkedRuns: [needsHumanRun('run-nh')] })} />)
		const user = userEvent.setup()

		const open = screen.getByRole('button', { name: /open run/i })
		await user.click(open)

		expect(mocks.openDrawer).toHaveBeenCalledWith('run-nh', 'activity')
	})

	it('opens the drawer on a terminal run event row, and keeps a secondary deep link to /runs/:id', async () => {
		render(<IssueFeed issue={buildIssue({ linkedRuns: [completedRun('run-done')] })} />)
		const user = userEvent.setup()

		const launchedButton = screen.getAllByRole('button', { name: /open run/i })[0]
		await user.click(launchedButton)

		expect(mocks.openDrawer).toHaveBeenCalledWith('run-done', 'activity')
		expect(screen.getAllByRole('link', { name: /open run detail page/i }).length).toBeGreaterThan(0)
	})
})

describe('IssueFeed — activity timeline', () => {
	it('renders a human comment as a bordered card with author avatar', () => {
		render(
			<IssueFeed
				issue={buildIssue({
					comments: [
						comment({
							id: 'c-hello',
							body: 'Hello world',
							created_at: '2026-05-25T08:00:00.000Z'
						})
					]
				})}
			/>
		)

		expect(screen.getByText('Alice Example')).toBeInTheDocument()
		expect(screen.getByText('Hello world')).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: /open run/i })).toBeNull()
	})

	it('expands a terminal run into a launched event row and a completed event row', () => {
		render(<IssueFeed issue={buildIssue({ linkedRuns: [completedRun('run-done')] })} />)

		const activity = screen.getByRole('region', { name: 'Activity' })
		expect(within(activity).getByText('launched')).toBeInTheDocument()
		expect(within(activity).getByText('completed')).toBeInTheDocument()
	})

	it('promotes the waiting-human run to a callout above the Activity header (not in the timeline)', () => {
		render(<IssueFeed issue={buildIssue({ linkedRuns: [needsHumanRun('run-nh')] })} />)

		const callout = screen.getByRole('region', { name: 'Needs your decision' })
		expect(callout).toBeInTheDocument()
		const activity = screen.getByRole('region', { name: 'Activity' })
		expect(within(activity).queryByText(/needs your decision/i)).toBeNull()
		expect(within(activity).getByText(/no activity yet/i)).toBeInTheDocument()
	})

	it('renders the PR badge inline only when the completed run has a linked PR', () => {
		const { rerender } = render(
			<IssueFeed issue={buildIssue({ linkedRuns: [completedRun('run-no-pr')] })} />
		)
		expect(screen.queryByText('#42')).toBeNull()

		rerender(
			<IssueFeed
				issue={buildIssue({
					linkedRuns: [
						completedRun('run-pr', {
							number: 42,
							url: 'https://example.com/pr/42',
							state: 'open',
							merged_at: null
						})
					]
				})}
			/>
		)
		expect(screen.getByText('#42')).toBeInTheDocument()
	})

	it('renders a compact empty state when there are no comments and no qualifying run events', () => {
		render(<IssueFeed issue={buildIssue()} />)

		expect(screen.getByText(/no activity yet/i)).toBeInTheDocument()
		expect(screen.queryByRole('region', { name: 'Needs your decision' })).toBeNull()
	})
})
