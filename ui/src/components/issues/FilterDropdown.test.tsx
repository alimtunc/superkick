import { FilterDropdown } from '@/components/issues/FilterDropdown'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

interface RenderOptions {
	activePriorities?: Set<number>
	activeLabels?: Set<string>
	activeProject?: string | null
	onTogglePriority?: (v: number) => void
	onToggleLabel?: (v: string) => void
	onSelectProject?: (v: string | null) => void
	hasActiveFilters?: boolean
}

function renderDropdown(opts: RenderOptions = {}) {
	return render(
		<FilterDropdown
			allLabels={['bug', 'enhancement', 'docs']}
			labelColors={new Map([['bug', '#f43f5e']])}
			labelCounts={new Map([['bug', 4]])}
			activeLabels={opts.activeLabels ?? new Set()}
			onToggleLabel={opts.onToggleLabel ?? vi.fn()}
			allProjects={['Web', 'API']}
			activeProject={opts.activeProject ?? null}
			onSelectProject={opts.onSelectProject ?? vi.fn()}
			activePriorities={opts.activePriorities ?? new Set()}
			onTogglePriority={opts.onTogglePriority ?? vi.fn()}
			hasActiveFilters={opts.hasActiveFilters ?? false}
		/>
	)
}

describe('FilterDropdown', () => {
	it('opens the menu on trigger click and lists Priority / Labels / Project', async () => {
		const user = userEvent.setup()
		renderDropdown()

		await user.click(screen.getByRole('button', { name: 'Add filter' }))

		expect(await screen.findByText('Priority')).toBeInTheDocument()
		expect(screen.getByText('Labels')).toBeInTheDocument()
		expect(screen.getByText('Project')).toBeInTheDocument()
	})

	it('omits data-has-filters when no filter is active', () => {
		renderDropdown({ hasActiveFilters: false })

		expect(screen.getByRole('button', { name: 'Add filter' })).not.toHaveAttribute('data-has-filters')
	})

	it('sets data-has-filters on the trigger when filters are active', () => {
		renderDropdown({ hasActiveFilters: true })

		expect(screen.getByRole('button', { name: 'Add filter' })).toHaveAttribute('data-has-filters', 'true')
	})

	it('marks the Priority category as having a value when a priority is active', async () => {
		const user = userEvent.setup()
		renderDropdown({ activePriorities: new Set([2]) })

		await user.click(screen.getByRole('button', { name: 'Add filter' }))

		const priorityRow = (await screen.findByText('Priority')).closest('[data-has-value]')
		expect(priorityRow).toHaveAttribute('data-has-value', 'true')
	})

	it('closes the menu on Escape and returns focus to the trigger', async () => {
		const user = userEvent.setup()
		renderDropdown()

		const trigger = screen.getByRole('button', { name: 'Add filter' })
		await user.click(trigger)
		await screen.findByText('Priority')

		await user.keyboard('{Escape}')

		expect(screen.queryByText('Priority')).not.toBeInTheDocument()
	})
})
