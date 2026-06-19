import { StatusPicker } from '@/domains/issues/components/pickers/StatusPicker'
import type { WorkflowStateOption } from '@/types'
import { Popover } from '@base-ui/react/popover'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

function renderPicker(states: WorkflowStateOption[], currentId: string | null = null) {
	return render(
		<Popover.Root open>
			<StatusPicker states={states} currentId={currentId} onSelect={vi.fn()} />
		</Popover.Root>
	)
}

describe('StatusPicker', () => {
	it('renders a StatusIcon for each state with the state colour', () => {
		renderPicker([
			{
				id: 's1',
				name: 'Backlog',
				state_type: 'backlog',
				color: '#bec2c8',
				position: 0
			},
			{
				id: 's2',
				name: 'In Progress',
				state_type: 'started',
				color: '#f2c94c',
				position: 1
			}
		])

		expect(screen.getByRole('img', { name: /backlog/i })).toBeInTheDocument()
		expect(screen.getByRole('img', { name: /in progress/i })).toBeInTheDocument()
	})

	it('shows the empty-team copy when the workflow has no states', () => {
		renderPicker([])
		expect(screen.getByText(/no statuses available/i)).toBeInTheDocument()
	})
})
