import { ActiveFiltersBar } from '@/components/issues/ActiveFiltersBar'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

describe('ActiveFiltersBar', () => {
	it('renders removable priority and label filters as native buttons', () => {
		render(
			<ActiveFiltersBar
				activeLabels={new Set(['bug'])}
				labelColors={new Map([['bug', '#f43f5e']])}
				onToggleLabel={vi.fn()}
				activeProject={null}
				onClearProject={vi.fn()}
				activePriorities={new Set([2])}
				onTogglePriority={vi.fn()}
				onClearAll={vi.fn()}
			/>
		)

		expect(screen.getByRole('button', { name: 'Remove priority High' }).tagName).toBe('BUTTON')
		expect(screen.getByRole('button', { name: 'Remove label bug' }).tagName).toBe('BUTTON')
	})
})
