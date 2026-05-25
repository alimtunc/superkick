import type { ReactNode } from 'react'

import { IssueChipPicker } from '@/components/launch/IssueChipPicker'
import { issuesQuery } from '@/lib/queries'
import type { LinearIssueListItem } from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const ISSUE_A: LinearIssueListItem = {
	id: 'issue-a',
	identifier: 'SUP-101',
	title: 'Wire up the runner',
	status: { state_type: 'started', name: 'In Progress', color: '#5b6ef2' },
	team_id: null,
	priority: { value: 2, label: 'High' },
	labels: [],
	assignee: null,
	project: null,
	parent: null,
	children: [],
	blocked_by: [],
	url: 'https://linear.app/sup-101',
	created_at: '2026-05-01T00:00:00Z',
	updated_at: '2026-05-01T00:00:00Z',
	completed_at: null
}

const ISSUE_B: LinearIssueListItem = {
	id: 'issue-b',
	identifier: 'SUP-202',
	title: 'Polish the launch composer',
	status: { state_type: 'unstarted', name: 'Todo', color: '#9aa0a8' },
	team_id: null,
	priority: { value: 3, label: 'Medium' },
	labels: [],
	assignee: null,
	project: null,
	parent: null,
	children: [],
	blocked_by: [],
	url: 'https://linear.app/sup-202',
	created_at: '2026-05-01T00:00:00Z',
	updated_at: '2026-05-01T00:00:00Z',
	completed_at: null
}

function withClient(node: ReactNode) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	client.setQueryData(issuesQuery().queryKey, { issues: [ISSUE_A, ISSUE_B], total_count: 2 })
	return <QueryClientProvider client={client}>{node}</QueryClientProvider>
}

describe('IssueChipPicker', () => {
	it('shows "pick…" when value is null', () => {
		render(withClient(<IssueChipPicker value={null} onChange={vi.fn()} />))

		expect(screen.getByRole('combobox', { name: 'Select issue' })).toHaveTextContent('pick…')
	})

	it('shows the identifier when a value is set', () => {
		render(
			withClient(
				<IssueChipPicker
					value={{ id: ISSUE_A.id, identifier: ISSUE_A.identifier, title: ISSUE_A.title }}
					onChange={vi.fn()}
				/>
			)
		)

		expect(screen.getByRole('combobox', { name: 'Select issue' })).toHaveTextContent('SUP-101')
	})

	it('opens the popup with the issues list and a search input', async () => {
		const user = userEvent.setup()
		render(withClient(<IssueChipPicker value={null} onChange={vi.fn()} />))

		await user.click(screen.getByRole('combobox', { name: 'Select issue' }))

		expect(await screen.findByPlaceholderText('Search issues…')).toBeInTheDocument()
		expect(screen.getByText('SUP-101')).toBeInTheDocument()
		expect(screen.getByText('SUP-202')).toBeInTheDocument()
	})

	it('filters the list by identifier when typing', async () => {
		const user = userEvent.setup()
		render(withClient(<IssueChipPicker value={null} onChange={vi.fn()} />))

		await user.click(screen.getByRole('combobox', { name: 'Select issue' }))
		await user.type(await screen.findByPlaceholderText('Search issues…'), '202')

		expect(screen.queryByText('SUP-101')).not.toBeInTheDocument()
		expect(screen.getByText('SUP-202')).toBeInTheDocument()
	})
})
