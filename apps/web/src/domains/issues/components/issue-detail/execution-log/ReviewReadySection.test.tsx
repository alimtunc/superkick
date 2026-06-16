import type {
	IssueDetailResponse,
	LaunchTaskStep,
	LaunchTaskWithSteps,
	LinkedRunSummary,
	WorktreeFacts
} from '@/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ReviewReadySection } from './ReviewReadySection'

vi.mock('@/domains/launch/components/ship/ShipModal', () => ({ ShipModal: () => null }))
vi.mock('@/stores/runDrawer', () => ({ useRunDrawerStore: () => () => {} }))

const issue = {
	id: 'issue-1',
	identifier: 'SUP-195',
	title: 'Ship it',
	team_id: 'team-1'
} as unknown as IssueDetailResponse
const run = { id: 'run-1' } as unknown as LinkedRunSummary
const worktree: WorktreeFacts = { branch: 'feat/x', worktreePath: '/tmp/x', pr: null }

function buildTask(status: string): LaunchTaskWithSteps {
	const step = {
		id: 's1',
		status: 'completed',
		structured_result: { status: 'completed', summary: 'did it', changed_files: ['a.ts'], questions: [] },
		failure_classification: null,
		auto_resume_count: 0
	} as unknown as LaunchTaskStep
	return { task: { id: 't1', status, summary: 'did it' }, steps: [step] } as unknown as LaunchTaskWithSteps
}

describe('ReviewReadySection', () => {
	it('shows Ready for review with Ship + Review actions on success with a worktree', () => {
		render(
			<ReviewReadySection
				issue={issue}
				task={buildTask('completed')}
				run={run}
				runDetail={null}
				worktree={worktree}
			/>
		)
		expect(screen.getByText('Ready for review')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: /Ship/ })).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Review changes' })).toBeInTheDocument()
	})

	it('offers no ship/review when there is no worktree', () => {
		render(
			<ReviewReadySection
				issue={issue}
				task={buildTask('completed')}
				run={null}
				runDetail={null}
				worktree={null}
			/>
		)
		expect(screen.getByText(/nothing to review or ship/)).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: /Ship/ })).not.toBeInTheDocument()
	})

	it('hides Ship and surfaces the PR once one exists', () => {
		const shipped: WorktreeFacts = {
			branch: 'feat/x',
			worktreePath: '/tmp/x',
			pr: { number: 182, url: 'https://github.com/o/r/pull/182', state: 'draft', merged_at: null }
		}
		render(
			<ReviewReadySection
				issue={issue}
				task={buildTask('completed')}
				run={run}
				runDetail={null}
				worktree={shipped}
			/>
		)
		expect(screen.getByText('In review')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: /Open PR/ })).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: /^Ship/ })).not.toBeInTheDocument()
	})

	it('does not offer Ship for a failed task', () => {
		render(
			<ReviewReadySection
				issue={issue}
				task={buildTask('failed')}
				run={run}
				runDetail={null}
				worktree={worktree}
			/>
		)
		expect(screen.getByText('Launch task failed')).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: /Ship/ })).not.toBeInTheDocument()
	})
})
