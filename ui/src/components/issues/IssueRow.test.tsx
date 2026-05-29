import type { ReactNode } from 'react'

import { IssueRow } from '@/components/issues/IssueRow'
import type { IssueChildRef, IssueWithState, LinearIssueListItem, LinearStateType, RunState } from '@/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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

vi.mock('@/components/issues/HoverCard', () => ({
	HoverCard: ({ children }: { children: ReactNode }) => <>{children}</>
}))

const NOW = new Date('2026-05-21T12:00:00Z')

function makeIssue(overrides: Partial<LinearIssueListItem> = {}): LinearIssueListItem {
	return {
		id: 'i-1',
		identifier: 'SUP-1',
		title: 'Fix login bug',
		status: { state_type: 'started', name: 'In Progress', color: '#fff' },
		team_id: null,
		priority: { value: 2, label: 'High' },
		labels: [],
		assignee: null,
		project: null,
		parent: null,
		children: [],
		blocked_by: [],
		url: 'https://l',
		created_at: NOW.toISOString(),
		updated_at: NOW.toISOString(),
		completed_at: null,
		...overrides
	}
}

function makeChild(stateType: LinearStateType): IssueChildRef {
	return {
		id: `c-${stateType}`,
		identifier: 'SUP-2',
		title: 'Child',
		status: { state_type: stateType, name: stateType, color: '#fff' },
		priority: { value: 0, label: 'None' },
		labels: [],
		assignee: null,
		updated_at: NOW.toISOString()
	}
}

function makeWrapper(issue: LinearIssueListItem, runState?: RunState): IssueWithState {
	return {
		issue,
		state: 'todo',
		bucket: undefined,
		reason: undefined,
		linkedRun: runState
			? {
					kind: 'run',
					run: {
						id: 'r',
						issue_id: issue.id,
						issue_identifier: issue.identifier,
						repo_slug: 'r',
						state: runState,
						trigger_source: 'manual',
						current_step_key: null,
						base_branch: null,
						worktree_path: null,
						branch_name: null,
						operator_instructions: null,
						started_at: NOW.toISOString(),
						updated_at: NOW.toISOString(),
						finished_at: null,
						error_message: null,
						budget: { duration_secs: null, retries_max: null, token_ceiling: null },
						pause_kind: 'none',
						pause_reason: null
					},
					bucket: 'active',
					reason: '',
					pending_attention_count: 0,
					pending_interrupt_count: 0
				}
			: undefined
	}
}

describe('IssueRow', () => {
	it('renders the title and identifier', () => {
		render(<IssueRow wrapper={makeWrapper(makeIssue())} bucket="open" now={NOW} />)
		expect(screen.getByText('Fix login bug')).toBeInTheDocument()
		expect(screen.getByText('SUP-1')).toBeInTheDocument()
	})

	it('renders no task-state dot when there is no agent activity (open bucket, no run)', () => {
		render(<IssueRow wrapper={makeWrapper(makeIssue())} bucket="open" now={NOW} />)
		expect(screen.queryByLabelText(/needs you|running|in review|shipped/i)).not.toBeInTheDocument()
	})

	it('renders the running task-state dot when bucket is active', () => {
		render(<IssueRow wrapper={makeWrapper(makeIssue(), 'coding')} bucket="active" now={NOW} />)
		expect(screen.getByLabelText('Running')).toBeInTheDocument()
	})

	it('renders the needs-you task-state dot when bucket is needs', () => {
		render(<IssueRow wrapper={makeWrapper(makeIssue(), 'waiting_human')} bucket="needs" now={NOW} />)
		expect(screen.getByLabelText('Needs you')).toBeInTheDocument()
	})

	it('renders the unassigned dashed avatar when assignee is null', () => {
		render(<IssueRow wrapper={makeWrapper(makeIssue())} bucket="open" now={NOW} />)
		expect(screen.getByLabelText('Unassigned')).toBeInTheDocument()
	})

	it('renders the assignee avatar when assignee is present', () => {
		const wrapper = makeWrapper(makeIssue({ assignee: { id: 'u-1', name: 'Alice', avatar_url: null } }))
		render(<IssueRow wrapper={wrapper} bucket="open" now={NOW} />)
		expect(screen.getByLabelText('Assigned to Alice')).toBeInTheDocument()
	})

	it('renders no more than two label chips and a +N indicator for the rest', () => {
		const labels = [
			{ name: 'bug', color: '#f00' },
			{ name: 'ui', color: '#0f0' },
			{ name: 'extra', color: '#00f' }
		]
		render(<IssueRow wrapper={makeWrapper(makeIssue({ labels }))} bucket="open" now={NOW} />)
		expect(screen.getByText('bug')).toBeInTheDocument()
		expect(screen.getByText('ui')).toBeInTheDocument()
		expect(screen.queryByText('extra')).not.toBeInTheDocument()
		expect(screen.getByText('+1')).toBeInTheDocument()
	})

	it('renders the sub-count with the total when the issue has children', () => {
		const children = [makeChild('completed'), makeChild('started'), makeChild('backlog')]
		render(<IssueRow wrapper={makeWrapper(makeIssue({ children }))} bucket="open" now={NOW} />)
		expect(screen.getByText('3')).toBeInTheDocument()
	})

	it('renders no sub-count when the issue has no children', () => {
		const { container } = render(<IssueRow wrapper={makeWrapper(makeIssue())} bucket="open" now={NOW} />)
		expect(container.querySelector('.row__subcount')).not.toBeInTheDocument()
	})

	it('renders the project tag when the issue has a project', () => {
		render(
			<IssueRow
				wrapper={makeWrapper(makeIssue({ project: { name: 'Platform' } }))}
				bucket="open"
				now={NOW}
			/>
		)
		expect(screen.getByText('Platform')).toBeInTheDocument()
	})

	it('keeps the title at full emphasis (not dimmed) in the done bucket', () => {
		render(<IssueRow wrapper={makeWrapper(makeIssue())} bucket="done" now={NOW} />)
		const title = screen.getByText('Fix login bug')
		expect(title).toHaveClass('row__title')
		expect(title).not.toHaveClass('text-fg-muted')
	})
})
