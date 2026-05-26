import { IssueGroupHeader } from '@/components/issues/IssueGroupHeader'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

describe('IssueGroupHeader', () => {
	it('renders the label and count', () => {
		render(
			<IssueGroupHeader
				label="Needs you"
				count={3}
				bucket="needs"
				statusKind="needs"
				pinned
				collapsed={false}
				onToggle={() => {}}
			/>
		)
		expect(screen.getByText('Needs you')).toBeInTheDocument()
		expect(screen.getByText('3')).toBeInTheDocument()
	})

	it('reflects collapsed state via aria-expanded', () => {
		const { rerender } = render(
			<IssueGroupHeader
				label="Active"
				count={1}
				bucket="active"
				statusKind="progress"
				pinned={false}
				collapsed={false}
				onToggle={() => {}}
			/>
		)
		expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')

		rerender(
			<IssueGroupHeader
				label="Active"
				count={1}
				bucket="active"
				statusKind="progress"
				pinned={false}
				collapsed
				onToggle={() => {}}
			/>
		)
		expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
	})

	it('fires onToggle when clicked', async () => {
		const user = userEvent.setup()
		const onToggle = vi.fn()
		render(
			<IssueGroupHeader
				label="Launchable"
				count={2}
				bucket="launchable"
				statusKind="todo"
				pinned={false}
				collapsed={false}
				onToggle={onToggle}
			/>
		)
		await user.click(screen.getByRole('button'))
		expect(onToggle).toHaveBeenCalledOnce()
	})

	it('uses the sticky positioning class for the row', () => {
		render(
			<IssueGroupHeader
				label="Open"
				count={5}
				bucket="open"
				statusKind="backlog"
				pinned={false}
				collapsed={false}
				onToggle={() => {}}
			/>
		)
		expect(screen.getByRole('button').className).toContain('sticky')
	})
})
