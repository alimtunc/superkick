import { AgentPicker } from '@/components/launch/AgentPicker'
import type { Agent } from '@/types'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const AGENTS: Agent[] = [
	{
		name: 'codex-implement',
		provider: 'codex',
		role: 'coder',
		model: null,
		runner_mode: 'exec_json',
		executor: 'codex_structured',
		default_reasoning: 'medium',
		enabled: true,
		billing_profile: 'subscription',
		origin: 'builtin',
		avatar: null,
		description: null
	},
	{
		name: 'claude-implement',
		provider: 'claude',
		role: 'coder',
		model: null,
		runner_mode: 'interactive_pty',
		executor: 'interactive_pty',
		default_reasoning: 'medium',
		enabled: true,
		billing_profile: 'subscription',
		origin: 'builtin',
		avatar: null,
		description: null
	},
	{
		name: 'team-coder',
		provider: 'claude',
		role: 'coder',
		model: 'sonnet-4.6',
		runner_mode: 'interactive_pty',
		executor: 'interactive_pty',
		default_reasoning: 'medium',
		enabled: true,
		billing_profile: 'subscription',
		origin: 'custom',
		avatar: null,
		description: null
	}
]

describe('AgentPicker', () => {
	it('shows the current value on the trigger', () => {
		render(
			<AgentPicker
				value="claude-implement"
				agents={AGENTS}
				onChange={vi.fn()}
				recommendedFor="implement"
				icon="bot"
				label="implement"
			/>
		)

		expect(screen.getByRole('button', { name: 'implement: claude-implement' })).toBeInTheDocument()
	})

	it('falls back to "choose…" when no value is selected', () => {
		render(
			<AgentPicker
				value={null}
				agents={AGENTS}
				onChange={vi.fn()}
				recommendedFor="implement"
				icon="bot"
				label="implement"
			/>
		)

		expect(screen.getByRole('button', { name: 'Pick implement agent' })).toBeInTheDocument()
	})

	it('groups items by provider with built-in and custom subheaders', async () => {
		const user = userEvent.setup()
		render(
			<AgentPicker
				value={null}
				agents={AGENTS}
				onChange={vi.fn()}
				recommendedFor="implement"
				icon="bot"
				label="implement"
			/>
		)

		await user.click(screen.getByRole('button', { name: 'Pick implement agent' }))

		expect(await screen.findByText('Codex · Built-in')).toBeInTheDocument()
		expect(screen.getByText('Claude · Built-in')).toBeInTheDocument()
		expect(screen.getByText('Claude · Custom')).toBeInTheDocument()
		expect(screen.getByText('codex-implement')).toBeInTheDocument()
		expect(screen.getByText('team-coder')).toBeInTheDocument()
		// Every coder-role entry is recommended for the `implement` step.
		expect(screen.getAllByText('Recommended').length).toBe(3)
	})

	it('calls onChange when a non-current item is selected', async () => {
		const user = userEvent.setup()
		const onChange = vi.fn()
		render(
			<AgentPicker
				value="codex-implement"
				agents={AGENTS}
				onChange={onChange}
				recommendedFor="implement"
				icon="bot"
				label="implement"
			/>
		)

		await user.click(screen.getByRole('button', { name: 'implement: codex-implement' }))
		await user.click(await screen.findByText('team-coder'))

		expect(onChange).toHaveBeenCalledWith('team-coder')
	})

	it('hides disabled agents from new compositions', async () => {
		const user = userEvent.setup()
		render(
			<AgentPicker
				value={null}
				agents={[...AGENTS, { ...AGENTS[2], name: 'retired-coder', enabled: false }]}
				onChange={vi.fn()}
				recommendedFor="implement"
				icon="bot"
				label="implement"
			/>
		)

		await user.click(screen.getByRole('button', { name: 'Pick implement agent' }))

		expect(await screen.findByText('team-coder')).toBeInTheDocument()
		expect(screen.queryByText('retired-coder')).not.toBeInTheDocument()
	})

	it('still shows a selected agent that has since been disabled', () => {
		render(
			<AgentPicker
				value="retired-coder"
				agents={[{ ...AGENTS[2], name: 'retired-coder', enabled: false }]}
				onChange={vi.fn()}
				recommendedFor="implement"
				icon="bot"
				label="implement"
			/>
		)

		expect(screen.getByRole('button', { name: 'implement: retired-coder' })).toBeInTheDocument()
	})
})
