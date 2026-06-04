import type { ReactNode } from 'react'

import { ChangesTab } from '@/components/run-detail/RunWorkspaceTabs/ChangesTab'
import { multiFileDiffSmokeFiles } from '@/components/run-detail/RunWorkspaceTabs/ChangesTab.fixture'
import type { FileDiff, Run, RunDiffResponse } from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	fetchRunDiff: vi.fn()
}))

vi.mock('@/api', async () => {
	const actual = await vi.importActual<typeof import('@/api')>('@/api')
	return { ...actual, fetchRunDiff: mocks.fetchRunDiff }
})

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

function wrap(node: ReactNode) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
	})
	return <QueryClientProvider client={client}>{node}</QueryClientProvider>
}

beforeEach(() => {
	mocks.fetchRunDiff.mockReset()
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

	it('renders a multi-file summary and expands the patch on a modified row', async () => {
		mocks.fetchRunDiff.mockResolvedValue({
			kind: 'ok',
			value: buildResponse(multiFileDiffSmokeFiles)
		})

		const user = userEvent.setup()
		render(wrap(<ChangesTab run={buildRun()} pr={null} />))

		const row = await screen.findByRole('button', { name: /ChangesTab\.test\.tsx/ })
		expect(screen.getByText('3 files')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: /ChangesTab\.fixture\.ts/ })).toBeInTheDocument()
		expect(screen.getByRole('button', { name: /diff-viewer-smoke\.md/ })).toBeInTheDocument()
		expect(screen.getByText('+9')).toBeInTheDocument()
		expect(screen.getByText('−3')).toBeInTheDocument()

		await user.click(row)
		expect(screen.getByText(/-\s*expect\(screen\.getByText\("\+5"\)/)).toBeInTheDocument()
		expect(screen.getByText(/\+\s*expect\(screen\.getByText\("\+9"\)/)).toBeInTheDocument()
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

		const row = await screen.findByRole('button', { name: /assets\/logo\.png/ })
		expect(row).toBeDisabled()
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

		await screen.findByRole('button', { name: /src\/big\.ts/ })
		expect(screen.getByText('patch truncated')).toBeInTheDocument()
	})
})
