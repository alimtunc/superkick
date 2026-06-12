import type { ReactNode } from 'react'

import { IssuePullRequestsBlock } from '@/components/issue-detail/IssuePullRequestsBlock'
import type { IssueDetailResponse, IssuePullRequest } from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	fetchIssuePullRequestDiff: vi.fn()
}))

vi.mock('@/api', async () => {
	const actual = await vi.importActual<typeof import('@/api')>('@/api')
	return { ...actual, fetchIssuePullRequestDiff: mocks.fetchIssuePullRequestDiff }
})

vi.mock('@/components/diff/DiffPatchView', () => ({
	DiffPatchView: ({ patch }: { patch: string }) => <div data-testid="diff">{patch}</div>
}))

const pr: IssuePullRequest = {
	issue_id: 'issue-uuid',
	issue_identifier: 'SUP-222',
	repo_slug: 'acme/superkick',
	number: 42,
	url: 'https://github.com/acme/superkick/pull/42',
	state: 'open',
	title: 'SUP-222 ready for review',
	head_branch: 'codex/sup-222',
	head_sha: 'abc123',
	base_branch: 'main',
	source: 'linear_attachment',
	created_at: '2026-06-01T00:00:00Z',
	updated_at: '2026-06-01T00:00:00Z',
	merged_at: null,
	synced_at: '2026-06-01T00:00:00Z'
}

function issue(): IssueDetailResponse {
	return {
		id: 'issue-uuid',
		identifier: 'SUP-222',
		title: 'Demo',
		status: { state_type: 'started', name: 'In Progress', color: '#16a34a' },
		priority: { value: 2, label: 'High' },
		url: 'https://linear.app/acme/issue/SUP-222',
		created_at: '2026-06-01T00:00:00Z',
		updated_at: '2026-06-01T00:00:00Z',
		description: '',
		labels: [],
		assignee: null,
		project: null,
		cycle: null,
		estimate: null,
		due_date: null,
		parent: null,
		children: [],
		blocked_by: [],
		team_id: 'team-1',
		comments: [],
		linked_runs: [],
		linked_prs: [pr]
	}
}

function wrap(node: ReactNode) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	return <QueryClientProvider client={client}>{node}</QueryClientProvider>
}

beforeEach(() => {
	mocks.fetchIssuePullRequestDiff.mockReset()
})

describe('IssuePullRequestsBlock', () => {
	it('lazy-loads the PR diff when the diff action opens the drawer', async () => {
		mocks.fetchIssuePullRequestDiff.mockResolvedValue({
			pr,
			cached: false,
			files: [
				{
					path: 'ui/src/App.tsx',
					old_path: null,
					status: 'modified',
					additions: 4,
					deletions: 2,
					patch: '@@ -1 +1 @@\n-old\n+new',
					position: 0
				}
			]
		})
		const user = userEvent.setup()

		render(wrap(<IssuePullRequestsBlock issue={issue()} runPr={null} />))

		expect(screen.getByText('SUP-222 ready for review')).toBeInTheDocument()
		expect(mocks.fetchIssuePullRequestDiff).not.toHaveBeenCalled()

		await user.click(screen.getByRole('button', { name: /view diff for pull request #42/i }))

		await waitFor(() => {
			expect(mocks.fetchIssuePullRequestDiff).toHaveBeenCalledWith('issue-uuid', 'acme/superkick', 42)
		})
		expect(await screen.findByText('App.tsx')).toBeInTheDocument()
		expect(await screen.findByTestId('diff')).toHaveTextContent('+new')
	})
})
