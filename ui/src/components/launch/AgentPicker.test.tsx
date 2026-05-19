import { AgentPicker } from '@/components/launch/AgentPicker'
import type { Agent } from '@/types'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const AGENTS: Agent[] = [
	{
		name: 'claude-coder',
		provider: 'claude',
		role: 'coder',
		model: 'sonnet-4.6',
		runner_mode: 'interactive_pty',
		billing_profile: 'subscription'
	},
	{
		name: 'gpt-review',
		provider: 'codex',
		role: 'reviewer',
		model: null,
		runner_mode: 'exec_json',
		billing_profile: 'api_credits'
	}
]

describe('AgentPicker', () => {
	it('shows the current value on the trigger', () => {
		render(
			<AgentPicker
				value="claude-coder"
				agents={AGENTS}
				onChange={vi.fn()}
				recommendedFor="implement"
				icon="agent"
				label="implement"
			/>
		)

		expect(screen.getByRole('button', { name: 'implement: claude-coder' })).toBeInTheDocument()
	})

	it('falls back to "choose…" when no value is selected', () => {
		render(
			<AgentPicker
				value={null}
				agents={AGENTS}
				onChange={vi.fn()}
				recommendedFor="implement"
				icon="agent"
				label="implement"
			/>
		)

		expect(screen.getByRole('button', { name: 'Pick implement agent' })).toBeInTheDocument()
	})

	it('opens the menu and marks the recommended agent', async () => {
		const user = userEvent.setup()
		render(
			<AgentPicker
				value={null}
				agents={AGENTS}
				onChange={vi.fn()}
				recommendedFor="implement"
				icon="agent"
				label="implement"
			/>
		)

		await user.click(screen.getByRole('button', { name: 'Pick implement agent' }))

		expect(await screen.findByText('claude-coder')).toBeInTheDocument()
		expect(screen.getByText('gpt-review')).toBeInTheDocument()
		expect(screen.getByText('Recommended')).toBeInTheDocument()
	})

	it('calls onChange when a non-current item is selected', async () => {
		const user = userEvent.setup()
		const onChange = vi.fn()
		render(
			<AgentPicker
				value="claude-coder"
				agents={AGENTS}
				onChange={onChange}
				recommendedFor="implement"
				icon="agent"
				label="implement"
			/>
		)

		await user.click(screen.getByRole('button', { name: 'implement: claude-coder' }))
		await user.click(await screen.findByText('gpt-review'))

		expect(onChange).toHaveBeenCalledWith('gpt-review')
	})
})
