import { IssueViewTabs } from '@/components/issues/IssueViewTabs'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const COUNTS = { mine: 4, 'all-open': 12, shipped: 3 } as const

describe('IssueViewTabs', () => {
	it('renders all three saved-view tabs in canonical order', () => {
		render(<IssueViewTabs tab="mine" counts={COUNTS} onChange={() => {}} />)
		const tabs = screen.getAllByRole('button').slice(0, 3)
		expect(tabs.map((t) => t.textContent)).toEqual([
			expect.stringContaining('My open work'),
			expect.stringContaining('All open'),
			expect.stringContaining('Recently shipped')
		])
	})

	it('marks the active tab via aria-pressed', () => {
		render(<IssueViewTabs tab="all-open" counts={COUNTS} onChange={() => {}} />)
		const active = screen.getByRole('button', { pressed: true })
		expect(active).toHaveTextContent('All open')
	})

	it('renders the count next to each tab label', () => {
		render(<IssueViewTabs tab="mine" counts={COUNTS} onChange={() => {}} />)
		expect(screen.getByRole('button', { name: /My open work/ })).toHaveTextContent('4')
		expect(screen.getByRole('button', { name: /All open/ })).toHaveTextContent('12')
		expect(screen.getByRole('button', { name: /Recently shipped/ })).toHaveTextContent('3')
	})

	it('does not render a New view stub', () => {
		render(<IssueViewTabs tab="mine" counts={COUNTS} onChange={() => {}} />)
		expect(screen.queryByRole('button', { name: /New view/ })).not.toBeInTheDocument()
	})

	it('fires onChange with the selected tab value', async () => {
		const user = userEvent.setup()
		const onChange = vi.fn()
		render(<IssueViewTabs tab="mine" counts={COUNTS} onChange={onChange} />)
		await user.click(screen.getByRole('button', { name: /All open/ }))
		expect(onChange).toHaveBeenCalledWith('all-open')
	})
})
