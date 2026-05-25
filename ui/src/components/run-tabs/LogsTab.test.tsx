import { LogsTab } from '@/components/run-tabs/LogsTab'
import type { RunEvent } from '@/types'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

function logEvent(overrides: Partial<RunEvent> = {}): RunEvent {
	return {
		id: 'evt-1',
		run_id: 'run-1',
		run_step_id: null,
		ts: '2026-05-25T10:00:00.000Z',
		kind: 'agent_output',
		level: 'info',
		message: 'hello from the agent',
		payload_json: null,
		...overrides
	}
}

describe('LogsTab', () => {
	it('renders empty state and no transcript link when no handler is provided', () => {
		render(<LogsTab events={[]} />)
		expect(screen.getByText('No logs yet')).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: /full terminal transcript/i })).not.toBeInTheDocument()
	})

	it('renders the transcript link when onOpenTerminal is provided, and fires it on click', async () => {
		const onOpenTerminal = vi.fn()
		const user = userEvent.setup()
		render(<LogsTab events={[]} onOpenTerminal={onOpenTerminal} />)

		const link = screen.getByRole('button', { name: /full terminal transcript/i })
		await user.click(link)
		expect(onOpenTerminal).toHaveBeenCalledTimes(1)
	})

	it('renders log rows with the transcript link on top', () => {
		const onOpenTerminal = vi.fn()
		render(
			<LogsTab
				events={[logEvent(), logEvent({ id: 'evt-2', kind: 'command_output', message: '$ ls' })]}
				onOpenTerminal={onOpenTerminal}
			/>
		)
		expect(screen.getByRole('button', { name: /full terminal transcript/i })).toBeInTheDocument()
		expect(screen.getByText('hello from the agent')).toBeInTheDocument()
		expect(screen.getByText('$ ls')).toBeInTheDocument()
	})
})
