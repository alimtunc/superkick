import { IssueFilterDropdown } from '@/components/issues/IssueFilterDropdown'
import { EMPTY_FILTERS } from '@/lib/issues/searchParams'
import type { FilterOptionSet } from '@/types'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

const OPTIONS: FilterOptionSet = {
	assignees: [{ id: 'u-1', name: 'Alice' }],
	statuses: [{ state_type: 'started', name: 'In Progress' }],
	priorities: [{ value: 1, label: 'Urgent' }],
	labels: [{ name: 'bug', color: '#f00' }],
	projects: ['Superkick'],
	repos: ['superkick']
}

function renderOpen() {
	render(
		<IssueFilterDropdown
			filters={EMPTY_FILTERS}
			onChange={() => {}}
			options={OPTIONS}
			open
			onOpenChange={() => {}}
			trigger={<button type="button">Filter</button>}
		/>
	)
}

describe('IssueFilterDropdown', () => {
	it('keeps the four previously-dropped facets in the dropdown', () => {
		renderOpen()
		expect(screen.getByText('Creator')).toBeInTheDocument()
		expect(screen.getByText('Milestone')).toBeInTheDocument()
		expect(screen.getByText('Cycle')).toBeInTheDocument()
		expect(screen.getByText('Estimate')).toBeInTheDocument()
	})

	it('orders Priority before Status and pins Task state last', () => {
		renderOpen()
		const list = screen.getByRole('list')
		const labels = within(list)
			.getAllByText(
				/^(Assignee|Creator|Priority|Status|Label|Project|Repo|Milestone|Cycle|Estimate|Created|Updated|Completed|Has sub-issues|Task state)$/
			)
			.map((el) => el.textContent)
		expect(labels.indexOf('Priority')).toBeLessThan(labels.indexOf('Status'))
		expect(labels.at(-1)).toBe('Task state')
		expect(labels.indexOf('Has sub-issues')).toBeLessThan(labels.indexOf('Task state'))
	})

	it('flags the Task state row with the SK provenance tag', () => {
		renderOpen()
		expect(screen.getByText('SK')).toBeInTheDocument()
	})

	it('offers the "Save current as view…" footer row', () => {
		renderOpen()
		expect(screen.getByText('Save current as view…')).toBeInTheDocument()
	})
})
