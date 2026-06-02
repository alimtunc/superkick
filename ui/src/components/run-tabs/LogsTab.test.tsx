import { LogsTab } from '@/components/run-tabs/LogsTab'
import type { ProtocolEvent, RunEvent } from '@/types'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

function logEvent(overrides: Partial<RunEvent> = {}): RunEvent {
	return {
		id: 'evt-1',
		run_id: 'run-1',
		run_step_id: null,
		seq: 0,
		ts: '2026-05-25T10:00:00.000Z',
		kind: 'agent_output',
		level: 'info',
		message: 'hello from the agent',
		payload_json: null,
		...overrides
	}
}

function protocolEvent(event: ProtocolEvent, overrides: Partial<RunEvent> = {}): RunEvent {
	return {
		id: 'proto-1',
		run_id: 'run-1',
		run_step_id: null,
		seq: 1,
		ts: '2026-05-25T10:01:00.000Z',
		kind: 'agent_protocol',
		level: 'info',
		message: 'protocol',
		payload_json: { seq: 1, at: '2026-05-25T10:01:00.000Z', ...event },
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

	it('includes a protocol log warn diagnostic alongside legacy output', () => {
		render(
			<LogsTab
				events={[
					logEvent(),
					protocolEvent({
						kind: 'log',
						level: 'warn',
						message: 'codex: unparseable jsonl: {garbage'
					})
				]}
			/>
		)
		expect(screen.getByText('hello from the agent')).toBeInTheDocument()
		expect(screen.getByText('codex: unparseable jsonl: {garbage')).toBeInTheDocument()
	})

	it('includes protocol text_block content', () => {
		render(
			<LogsTab
				events={[protocolEvent({ kind: 'text_block', block_id: 'b1', text: 'assistant said this' })]}
			/>
		)
		expect(screen.getByText('assistant said this')).toBeInTheDocument()
	})

	it('ignores agent_protocol events that are neither log nor text', () => {
		render(<LogsTab events={[protocolEvent({ kind: 'usage', input_tokens: 5, output_tokens: 5 })]} />)
		expect(screen.getByText('No logs yet')).toBeInTheDocument()
	})
})
