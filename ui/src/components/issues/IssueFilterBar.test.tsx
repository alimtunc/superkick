import { IssueFilterBar } from '@/components/issues/IssueFilterBar'
import { EMPTY_FILTERS } from '@/lib/issues/searchParams'
import type { IssueFilterState } from '@/types'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const OPTIONS = {
	assignees: [{ id: 'u-1', name: 'Alice' }],
	statuses: [
		{ state_type: 'started', name: 'In Progress' },
		{ state_type: 'completed', name: 'Done' }
	],
	priorities: [
		{ value: 1, label: 'Urgent' },
		{ value: 2, label: 'High' }
	],
	labels: [{ name: 'bug', color: '#f00' }],
	projects: ['Superkick'],
	repos: ['superkick']
}

function renderBar(
	overrides: Partial<{
		filters: IssueFilterState
		onFiltersChange: (next: IssueFilterState) => void
	}> = {}
) {
	const onFiltersChange = overrides.onFiltersChange ?? vi.fn()
	render(
		<IssueFilterBar
			filters={overrides.filters ?? EMPTY_FILTERS}
			sort="updated"
			group="lifecycle"
			layout="list"
			options={OPTIONS}
			onFiltersChange={onFiltersChange}
			onSortChange={() => {}}
			onGroupChange={() => {}}
			onLayoutChange={() => {}}
			dropdownOpen={false}
			onDropdownOpenChange={() => {}}
		/>
	)
	return { onFiltersChange }
}

describe('IssueFilterBar', () => {
	it('renders the + Filter button', () => {
		renderBar()
		expect(screen.getByRole('button', { name: /Filter/ })).toBeInTheDocument()
	})

	it('renders a chip per active filter', () => {
		renderBar({
			filters: {
				...EMPTY_FILTERS,
				assignee: ['u-1'],
				status_not: ['completed']
			}
		})
		expect(screen.getByLabelText('Remove filter Assignee = Alice')).toBeInTheDocument()
		expect(screen.getByLabelText('Remove filter Status ≠ Done')).toBeInTheDocument()
	})

	it('removes a chip via onFiltersChange when × is clicked', async () => {
		const user = userEvent.setup()
		const { onFiltersChange } = renderBar({
			filters: { ...EMPTY_FILTERS, label: ['bug'] }
		})
		await user.click(screen.getByLabelText('Remove filter Label = bug'))
		expect(onFiltersChange).toHaveBeenCalledWith({
			...EMPTY_FILTERS,
			label: []
		})
	})

	it('toggles supported chip operators between include and exclude', async () => {
		const user = userEvent.setup()
		const { onFiltersChange } = renderBar({
			filters: { ...EMPTY_FILTERS, status: ['completed'] }
		})
		await user.click(screen.getByLabelText('Toggle operator for Status = Done'))
		expect(onFiltersChange).toHaveBeenCalledWith({
			...EMPTY_FILTERS,
			status: [],
			status_not: ['completed']
		})
	})

	it('renders the layout toggle with the right active button', () => {
		renderBar()
		expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true')
		expect(screen.getByRole('button', { name: 'Board view' })).toHaveAttribute('aria-pressed', 'false')
	})
})
