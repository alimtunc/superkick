import { StepFocusSelector } from '@/components/task-cockpit/StepFocusSelector'
import type { LaunchStepKind, LaunchTaskStep } from '@/types'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

function step(kind: LaunchStepKind, overrides: Partial<LaunchTaskStep> = {}): LaunchTaskStep {
	return {
		id: `ls-${kind}`,
		launch_task_id: 'task-1',
		sequence: 1,
		step_kind: kind,
		agent_name: 'claude',
		provider: null,
		model: null,
		mode: null,
		status: 'completed',
		auto_resume_count: 0,
		created_at: '2026-06-01T10:00:00.000Z',
		updated_at: '2026-06-01T10:00:00.000Z',
		...overrides
	}
}

describe('StepFocusSelector', () => {
	it('renders "All steps" plus one tab per enabled step and reports selection', async () => {
		const onSelect = vi.fn()
		const steps = [
			step('plan', { id: 'a' }),
			step('implement', { id: 'b' }),
			step('review', { id: 'c', enabled: false })
		]
		render(<StepFocusSelector steps={steps} selectedStepId={null} onSelect={onSelect} />)

		expect(screen.getByRole('tab', { name: 'All steps' })).toHaveAttribute('aria-selected', 'true')
		expect(screen.getByRole('tab', { name: /Plan/ })).toBeInTheDocument()
		expect(screen.getByRole('tab', { name: /Implement/ })).toBeInTheDocument()
		expect(screen.queryByRole('tab', { name: /Review/ })).not.toBeInTheDocument()

		await userEvent.click(screen.getByRole('tab', { name: /Implement/ }))
		expect(onSelect).toHaveBeenCalledWith('b')
	})

	it('marks the selected step active and resets through "All steps"', async () => {
		const onSelect = vi.fn()
		render(
			<StepFocusSelector steps={[step('plan', { id: 'a' })]} selectedStepId="a" onSelect={onSelect} />
		)

		expect(screen.getByRole('tab', { name: /Plan/ })).toHaveAttribute('aria-selected', 'true')

		await userEvent.click(screen.getByRole('tab', { name: 'All steps' }))
		expect(onSelect).toHaveBeenCalledWith(null)
	})
})
