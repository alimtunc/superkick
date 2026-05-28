import type { ReactNode } from 'react'

import { IssueFeed } from '@/components/issue-detail/IssueFeed'
import type {
	IssueComment,
	IssueDetailResponse,
	IssueHistoryEntry,
	LinkedPrSummary,
	LinkedRunSummary
} from '@/types'
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
	comments = [],
	history,
	historyHasMore
}: {
	linkedRuns?: LinkedRunSummary[]
	comments?: IssueComment[]
	history?: IssueHistoryEntry[]
	historyHasMore?: boolean
} = {}): IssueDetailResponse {
	return {
		identifier: 'SUP-173',
		linked_runs: linkedRuns,
		comments,
		history,
		history_has_more: historyHasMore
	} as unknown as IssueDetailResponse
}

beforeEach(() => {
	mocks.openDrawer.mockReset()
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
	})

	it('expands a terminal run into launched and completed event rows in the timeline', () => {
		render(<IssueFeed issue={buildIssue({ linkedRuns: [completedRun('run-done')] })} />)

		const activity = screen.getByRole('region', { name: 'Activity' })
		expect(within(activity).getByText('launched')).toBeInTheDocument()
		expect(within(activity).getByText('completed')).toBeInTheDocument()
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

	it('opens the run drawer on the activity tab when clicking an Open run button', async () => {
		render(<IssueFeed issue={buildIssue({ linkedRuns: [completedRun('run-done')] })} />)
		const user = userEvent.setup()

		const buttons = screen.getAllByRole('button', { name: /open run/i })
		await user.click(buttons[0])

		expect(mocks.openDrawer).toHaveBeenCalledWith('run-done', 'activity')
	})

	it('sorts the chronology oldest-first like Linear', () => {
		render(
			<IssueFeed
				issue={buildIssue({
					comments: [
						comment({ id: 'c-old', body: 'older note', created_at: '2026-05-25T08:00:00.000Z' }),
						comment({ id: 'c-new', body: 'newer note', created_at: '2026-05-25T12:00:00.000Z' })
					]
				})}
			/>
		)

		const older = screen.getByText('older note')
		const newer = screen.getByText('newer note')
		expect(older.compareDocumentPosition(newer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
		expect(screen.queryByText('Newest first')).toBeNull()
	})

	it('renders a compact empty state when there are no comments and no qualifying run events', () => {
		render(<IssueFeed issue={buildIssue()} />)

		expect(screen.getByText(/no activity yet/i)).toBeInTheDocument()
	})

	it('renders history rows interleaved with comments and runs', () => {
		render(
			<IssueFeed
				issue={buildIssue({
					comments: [
						comment({
							id: 'c-mid',
							body: 'mid comment',
							created_at: '2026-05-25T10:00:00.000Z'
						})
					],
					history: [
						{
							id: 'created:abc',
							created_at: '2026-05-25T08:00:00.000Z',
							actor: null,
							events: [{ kind: 'created' }]
						},
						{
							id: 'h-desc',
							created_at: '2026-05-25T11:00:00.000Z',
							actor: { id: 'u-a', name: 'Alice', avatar_url: null },
							events: [{ kind: 'description_edited' }]
						}
					]
				})}
			/>
		)

		const activity = screen.getByRole('region', { name: 'Activity' })
		expect(within(activity).getByText(/created the issue/i)).toBeInTheDocument()
		expect(within(activity).getByText('mid comment')).toBeInTheDocument()
		expect(within(activity).getByText(/updated the description/i)).toBeInTheDocument()
	})

	it('renders the truncated footer only when history_has_more is true', () => {
		const { rerender } = render(
			<IssueFeed
				issue={buildIssue({
					history: [
						{
							id: 'created:abc',
							created_at: '2026-05-25T08:00:00.000Z',
							actor: null,
							events: [{ kind: 'created' }]
						}
					],
					historyHasMore: false
				})}
			/>
		)
		expect(screen.queryByText(/older history not loaded/i)).toBeNull()

		rerender(
			<IssueFeed
				issue={buildIssue({
					history: [
						{
							id: 'created:abc',
							created_at: '2026-05-25T08:00:00.000Z',
							actor: null,
							events: [{ kind: 'created' }]
						}
					],
					historyHasMore: true
				})}
			/>
		)
		expect(screen.getByText(/older history not loaded/i)).toBeInTheDocument()
	})
})
