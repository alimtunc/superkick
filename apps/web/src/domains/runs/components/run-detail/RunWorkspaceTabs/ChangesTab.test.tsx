import type { ReactNode } from 'react'

import { ChangesTab } from '@/domains/runs/components/run-detail/RunWorkspaceTabs/ChangesTab'
import type { DiffReviewState, FileDiff, Run, RunDiffResponse } from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	fetchRunDiff: vi.fn(),
	fetchRunReview: vi.fn(),
	setRunReviewFileReviewed: vi.fn(),
	fixRunReviewWithAi: vi.fn()
}))

vi.mock('@/api', async () => {
	const actual = await vi.importActual<typeof import('@/api')>('@/api')
	return {
		...actual,
		fetchRunDiff: mocks.fetchRunDiff,
		fetchRunReview: mocks.fetchRunReview,
		setRunReviewFileReviewed: mocks.setRunReviewFileReviewed,
		fixRunReviewWithAi: mocks.fixRunReviewWithAi
	}
})

// Stub the heavy @git-diff-view renderer; assert the data it receives instead.
vi.mock('@/domains/diff/components/DiffPatchView', () => ({
	DiffPatchView: ({
		patch,
		mode,
		review
	}: {
		patch: string
		mode: string
		review?: { threads: Array<{ comments: Array<{ body: string }> }> }
	}) => (
		<div data-testid="diff" data-mode={mode} data-review={review ? 'enabled' : 'disabled'}>
			{patch}
			{review?.threads.flatMap((thread) =>
				thread.comments.map((comment) => <p key={comment.body}>{comment.body}</p>)
			)}
		</div>
	)
}))

function buildRun(overrides: Partial<Run> = {}): Run {
	return {
		id: 'run-1',
		issue_id: 'issue-1',
		issue_identifier: 'SUP-178',
		repo_slug: 'org/repo',
		state: 'coding',
		trigger_source: 'launch',
		current_step_key: 'code',
		base_branch: 'main',
		worktree_path: '/tmp/.worktrees/sup-178',
		branch_name: 'feat/sup-178',
		operator_instructions: null,
		started_at: '2026-05-25T10:00:00.000Z',
		updated_at: '2026-05-25T10:01:00.000Z',
		finished_at: null,
		error_message: null,
		budget: { duration_secs: null, retries_max: null, token_ceiling: null },
		pause_kind: 'none',
		pause_reason: null,
		...overrides
	}
}

function buildResponse(files: FileDiff[]): RunDiffResponse {
	return {
		run: {
			id: 'run-1',
			useWorktree: true,
			worktreePath: '/tmp/.worktrees/sup-178',
			branchName: 'feat/sup-178'
		},
		diff: {
			baseRef: 'abcdef1234567',
			headRef: '7654321fedcba',
			files,
			fileCount: files.length,
			overflow: false
		}
	}
}

function buildReviewState(overrides: Partial<DiffReviewState> = {}): DiffReviewState {
	return {
		subject: { type: 'run', runId: 'run-1' },
		threads: [],
		reviewedFiles: [],
		unresolvedThreadCount: 0,
		unresolvedCommentCount: 0,
		...overrides
	}
}

function createTestQueryClient() {
	return new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
	})
}

function wrapWithClient(client: QueryClient, node: ReactNode) {
	return <QueryClientProvider client={client}>{node}</QueryClientProvider>
}

function wrap(node: ReactNode) {
	return wrapWithClient(createTestQueryClient(), node)
}

beforeEach(() => {
	mocks.fetchRunDiff.mockReset()
	mocks.fetchRunReview.mockReset().mockResolvedValue(buildReviewState())
	mocks.setRunReviewFileReviewed.mockReset().mockResolvedValue({
		subject: { type: 'run', runId: 'run-1' },
		filePath: 'src/foo.ts',
		oldPath: null,
		reviewed: true,
		reviewer: 'operator',
		updatedAt: '2026-06-11T20:00:00.000Z'
	})
	mocks.fixRunReviewWithAi.mockReset().mockResolvedValue({
		run: buildRun({ id: 'run-2' }),
		unresolvedCommentCount: 1
	})
})

describe('ChangesTab', () => {
	it('renders the "no diff captured" copy when the run has no worktree (API 404)', async () => {
		mocks.fetchRunDiff.mockResolvedValue({ kind: 'unavailable', reason: 'no_worktree' })

		render(wrap(<ChangesTab run={buildRun()} pr={null} />))

		expect(await screen.findByText('No diff captured')).toBeInTheDocument()
		expect(screen.getByText(/worktree has been cleaned up/i)).toBeInTheDocument()
	})

	it('reports a worktree-less run with the dedicated copy (API 422)', async () => {
		mocks.fetchRunDiff.mockResolvedValue({ kind: 'unavailable', reason: 'not_worktree_backed' })

		render(wrap(<ChangesTab run={buildRun()} pr={null} />))

		expect(await screen.findByText(/did not use a worktree/i)).toBeInTheDocument()
	})

	it('renders +X −Y and shows the patch expanded by default', async () => {
		mocks.fetchRunDiff.mockResolvedValue({
			kind: 'ok',
			value: buildResponse([
				{
					path: 'src/foo.ts',
					status: 'modified',
					additions: 5,
					deletions: 2,
					binary: false,
					truncated: false,
					patch: '@@ -1 +1 @@\n-old\n+new'
				}
			])
		})

		render(wrap(<ChangesTab run={buildRun()} pr={null} />))

		const region = await screen.findByRole('region', { name: 'src/foo.ts diff' })
		expect(within(region).getByText('+5')).toBeInTheDocument()
		expect(within(region).getByText('−2')).toBeInTheDocument()

		const diff = await screen.findByTestId('diff')
		expect(diff).toHaveTextContent('-old')
		expect(diff).toHaveTextContent('+new')
		expect(diff).toHaveAttribute('data-mode', 'unified')
	})

	it('toggles all files to split layout via the single header control', async () => {
		mocks.fetchRunDiff.mockResolvedValue({
			kind: 'ok',
			value: buildResponse([
				{
					path: 'src/foo.ts',
					status: 'modified',
					additions: 5,
					deletions: 2,
					binary: false,
					truncated: false,
					patch: '@@ -1 +1 @@\n-old\n+new'
				}
			])
		})

		const user = userEvent.setup()
		render(wrap(<ChangesTab run={buildRun()} pr={null} />))

		expect(await screen.findByTestId('diff')).toHaveAttribute('data-mode', 'unified')
		await user.click(screen.getByRole('button', { name: 'Split' }))
		expect(screen.getByTestId('diff')).toHaveAttribute('data-mode', 'split')
	})

	it('renders a binary file row without a patch toggle', async () => {
		mocks.fetchRunDiff.mockResolvedValue({
			kind: 'ok',
			value: buildResponse([
				{
					path: 'assets/logo.png',
					status: 'added',
					additions: 0,
					deletions: 0,
					binary: true,
					truncated: false,
					patch: null
				}
			])
		})

		render(wrap(<ChangesTab run={buildRun()} pr={null} />))

		const region = await screen.findByRole('region', { name: 'assets/logo.png diff' })
		expect(within(region).getByRole('button')).toBeDisabled()
		expect(screen.getByText('binary file')).toBeInTheDocument()
	})

	it('renders a "patch truncated" notice for an oversized patch', async () => {
		mocks.fetchRunDiff.mockResolvedValue({
			kind: 'ok',
			value: buildResponse([
				{
					path: 'src/big.ts',
					status: 'modified',
					additions: 99,
					deletions: 99,
					binary: false,
					truncated: true,
					patch: null
				}
			])
		})

		render(wrap(<ChangesTab run={buildRun()} pr={null} />))

		await screen.findByRole('region', { name: 'src/big.ts diff' })
		expect(screen.getByText('patch truncated')).toBeInTheDocument()
	})

	it('renders every file in the main stack and filters the left file index', async () => {
		mocks.fetchRunDiff.mockResolvedValue({
			kind: 'ok',
			value: buildResponse([
				{
					path: 'src/foo.ts',
					status: 'modified',
					additions: 5,
					deletions: 2,
					binary: false,
					truncated: false,
					patch: '@@ -1 +1 @@\n-old\n+new'
				},
				{
					path: 'src/bar.ts',
					status: 'added',
					additions: 1,
					deletions: 0,
					binary: false,
					truncated: false,
					patch: '@@ -1 +1 @@\n+bar'
				}
			])
		})

		const user = userEvent.setup()
		render(wrap(<ChangesTab run={buildRun()} pr={null} />))

		expect(await screen.findAllByTestId('diff')).toHaveLength(2)
		expect(screen.getByRole('region', { name: 'src/foo.ts diff' })).toBeInTheDocument()
		expect(screen.getByRole('region', { name: 'src/bar.ts diff' })).toBeInTheDocument()
		expect(screen.getByText('Modified')).toBeInTheDocument()
		expect(screen.getByText('Added')).toBeInTheDocument()

		const search = screen.getByRole('searchbox', { name: 'Search changed files' })
		await user.type(search, 'bar')

		expect(screen.queryByRole('button', { name: /jump to src\/foo\.ts/i })).not.toBeInTheDocument()
		expect(screen.getByRole('button', { name: /jump to src\/bar\.ts/i })).toBeInTheDocument()
		expect(screen.getAllByTestId('diff')).toHaveLength(2)
	})

	it('shows file comment counts, reviewed state, and inline thread bodies in file headers', async () => {
		mocks.fetchRunDiff.mockResolvedValue({
			kind: 'ok',
			value: buildResponse([
				{
					path: 'src/foo.ts',
					status: 'modified',
					additions: 5,
					deletions: 2,
					binary: false,
					truncated: false,
					patch: '@@ -1 +1 @@\n-old\n+new'
				},
				{
					path: 'src/bar.ts',
					status: 'modified',
					additions: 1,
					deletions: 0,
					binary: false,
					truncated: false,
					patch: '@@ -1 +1 @@\n+bar'
				}
			])
		})
		mocks.fetchRunReview.mockResolvedValue(
			buildReviewState({
				threads: [
					{
						id: 'thread-1',
						anchor: {
							subject: { type: 'run', runId: 'run-1' },
							issueId: 'issue-1',
							filePath: 'src/foo.ts',
							oldPath: null,
							side: 'new',
							oldLine: null,
							newLine: 1,
							hunkHeader: '@@ -1 +1 @@',
							hunkIndex: 0,
							baseRef: 'abcdef1234567',
							headRef: '7654321fedcba'
						},
						state: 'open',
						author: 'operator',
						createdAt: '2026-06-11T20:00:00.000Z',
						updatedAt: '2026-06-11T20:00:00.000Z',
						comments: [
							{
								id: 'comment-1',
								threadId: 'thread-1',
								author: 'operator',
								body: 'Please simplify this branch.',
								createdAt: '2026-06-11T20:00:00.000Z',
								updatedAt: '2026-06-11T20:00:00.000Z'
							}
						]
					}
				],
				reviewedFiles: [
					{
						subject: { type: 'run', runId: 'run-1' },
						filePath: 'src/bar.ts',
						oldPath: null,
						reviewed: true,
						reviewer: 'operator',
						updatedAt: '2026-06-11T20:00:00.000Z'
					}
				],
				unresolvedThreadCount: 1,
				unresolvedCommentCount: 1
			})
		)

		render(wrap(<ChangesTab run={buildRun()} pr={null} />))

		const fooRegion = await screen.findByRole('region', { name: 'src/foo.ts diff' })
		const barRegion = screen.getByRole('region', { name: 'src/bar.ts diff' })

		expect(fooRegion).toHaveTextContent('1 unresolved')
		expect(
			within(barRegion).getByRole('checkbox', { name: 'Mark src/bar.ts as not reviewed' })
		).toBeChecked()
		expect(screen.getByText('Please simplify this branch.')).toBeInTheDocument()
		expect(screen.getByText('1 unresolved comment')).toBeInTheDocument()
		expect(screen.getAllByTestId('diff')).toHaveLength(2)
		expect(screen.getAllByTestId('diff')[0]).toHaveAttribute('data-review', 'enabled')
	})

	it('disables review controls while review state is loading', async () => {
		mocks.fetchRunDiff.mockResolvedValue({
			kind: 'ok',
			value: buildResponse([
				{
					path: 'src/foo.ts',
					status: 'modified',
					additions: 5,
					deletions: 2,
					binary: false,
					truncated: false,
					patch: '@@ -1 +1 @@\n-old\n+new'
				}
			])
		})
		mocks.fetchRunReview.mockReturnValue(new Promise(() => undefined))

		render(wrap(<ChangesTab run={buildRun()} pr={null} />))

		expect(await screen.findByText('Loading review state...')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Fix with AI' })).toBeDisabled()
		expect(screen.getByRole('checkbox', { name: 'Mark src/foo.ts as reviewed' })).toBeDisabled()
		expect(screen.getByTestId('diff')).toHaveAttribute('data-review', 'disabled')
	})

	it('keeps review controls disabled when review state fails to load', async () => {
		mocks.fetchRunDiff.mockResolvedValue({
			kind: 'ok',
			value: buildResponse([
				{
					path: 'src/foo.ts',
					status: 'modified',
					additions: 5,
					deletions: 2,
					binary: false,
					truncated: false,
					patch: '@@ -1 +1 @@\n-old\n+new'
				}
			])
		})
		mocks.fetchRunReview.mockRejectedValue(new Error('review down'))

		render(wrap(<ChangesTab run={buildRun()} pr={null} />))

		expect(await screen.findByText('Review state unavailable')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Fix with AI' })).toBeDisabled()
		expect(screen.getByRole('checkbox', { name: 'Mark src/foo.ts as reviewed' })).toBeDisabled()
		expect(screen.getByTestId('diff')).toHaveAttribute('data-review', 'disabled')
	})

	it('toggles reviewed state and starts Fix with AI with unresolved comments', async () => {
		mocks.fetchRunDiff.mockResolvedValue({
			kind: 'ok',
			value: buildResponse([
				{
					path: 'src/foo.ts',
					status: 'modified',
					additions: 5,
					deletions: 2,
					binary: false,
					truncated: false,
					patch: '@@ -1 +1 @@\n-old\n+new'
				}
			])
		})
		mocks.fetchRunReview.mockResolvedValue(
			buildReviewState({
				unresolvedThreadCount: 1,
				unresolvedCommentCount: 1
			})
		)

		const user = userEvent.setup()
		render(wrap(<ChangesTab run={buildRun()} pr={null} />))

		await user.click(await screen.findByRole('checkbox', { name: 'Mark src/foo.ts as reviewed' }))
		await waitFor(() =>
			expect(mocks.setRunReviewFileReviewed).toHaveBeenCalledWith('run-1', {
				filePath: 'src/foo.ts',
				oldPath: null,
				reviewed: true
			})
		)

		await user.click(screen.getByRole('button', { name: 'Fix with AI' }))
		await waitFor(() => expect(mocks.fixRunReviewWithAi).toHaveBeenCalledWith('run-1'))
		expect(await screen.findByRole('status')).toHaveTextContent('Fix run started.')
		expect(screen.getByRole('link', { name: 'Open run run-2' })).toHaveAttribute('href', '/runs/run-2')
		expect(screen.getByRole('button', { name: 'Fix with AI' })).toBeDisabled()
	})

	it('shows a Fix with AI error and allows retry', async () => {
		mocks.fetchRunDiff.mockResolvedValue({
			kind: 'ok',
			value: buildResponse([
				{
					path: 'src/foo.ts',
					status: 'modified',
					additions: 5,
					deletions: 2,
					binary: false,
					truncated: false,
					patch: '@@ -1 +1 @@\n-old\n+new'
				}
			])
		})
		mocks.fetchRunReview.mockResolvedValue(
			buildReviewState({
				unresolvedThreadCount: 1,
				unresolvedCommentCount: 1
			})
		)
		mocks.fixRunReviewWithAi.mockRejectedValue(new Error('no unresolved review comments to fix'))

		const user = userEvent.setup()
		render(wrap(<ChangesTab run={buildRun()} pr={null} />))

		const fixButton = await screen.findByRole('button', { name: 'Fix with AI' })
		await user.click(fixButton)

		expect(await screen.findByRole('alert')).toHaveTextContent('no unresolved review comments to fix')
		expect(fixButton).toBeEnabled()
	})

	it('scopes Fix with AI success state to the reviewed run', async () => {
		mocks.fetchRunDiff.mockResolvedValue({
			kind: 'ok',
			value: buildResponse([
				{
					path: 'src/foo.ts',
					status: 'modified',
					additions: 5,
					deletions: 2,
					binary: false,
					truncated: false,
					patch: '@@ -1 +1 @@\n-old\n+new'
				}
			])
		})
		mocks.fetchRunReview.mockResolvedValue(
			buildReviewState({
				unresolvedThreadCount: 1,
				unresolvedCommentCount: 1
			})
		)

		const user = userEvent.setup()
		const client = createTestQueryClient()
		const view = render(wrapWithClient(client, <ChangesTab run={buildRun()} pr={null} />))

		await user.click(await screen.findByRole('button', { name: 'Fix with AI' }))
		expect(await screen.findByRole('status')).toHaveTextContent('Fix run started.')

		view.rerender(wrapWithClient(client, <ChangesTab run={buildRun({ id: 'run-3' })} pr={null} />))

		expect(screen.queryByRole('status')).not.toBeInTheDocument()
		await waitFor(() => expect(screen.getByRole('button', { name: 'Fix with AI' })).toBeEnabled())
	})
})
