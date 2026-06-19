import { HoverCard } from '@/domains/issues/components/HoverCard'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

describe('HoverCard', () => {
	it('reveals the content after hovering the trigger', async () => {
		const user = userEvent.setup()
		render(
			<HoverCard content={<div data-testid="card-content">Card details</div>}>
				<button type="button">Trigger</button>
			</HoverCard>
		)

		await user.hover(screen.getByRole('button', { name: 'Trigger' }))

		expect(await screen.findByTestId('card-content')).toBeInTheDocument()
	})

	it('renders the popup content interactive while open (regression for pointer-events bug)', async () => {
		const user = userEvent.setup()
		render(
			<HoverCard content={<div data-testid="card-content">Card details</div>}>
				<button type="button">Trigger</button>
			</HoverCard>
		)

		await user.hover(screen.getByRole('button', { name: 'Trigger' }))

		const content = await screen.findByTestId('card-content')
		expect(content).toBeInTheDocument()
		expect(window.getComputedStyle(content).pointerEvents).not.toBe('none')
	})
})
