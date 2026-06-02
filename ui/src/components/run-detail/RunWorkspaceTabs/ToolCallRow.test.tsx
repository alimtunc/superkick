import { ToolCallRow } from '@/components/run-detail/RunWorkspaceTabs/ToolCallRow'
import type { RunToolCall } from '@/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

function call(overrides: Partial<RunToolCall> = {}): RunToolCall {
	return {
		call_id: 'c1',
		tool_name: 'command_execution',
		conversation_id: '',
		turn_id: 'run-1',
		at: '2026-06-01T10:00:00.000Z',
		input: { command: 'cargo test --workspace' },
		output: null,
		is_error: false,
		...overrides
	}
}

describe('ToolCallRow', () => {
	it('shows the real command next to the tool name while collapsed', () => {
		render(<ToolCallRow call={call()} />)
		expect(screen.getByText('command_execution')).toBeInTheDocument()
		// SUP-185 polish: the row is no longer just the tool name.
		expect(screen.getByText('cargo test --workspace')).toBeInTheDocument()
	})

	it('marks a call with no result yet as running', () => {
		render(<ToolCallRow call={call()} />)
		expect(screen.getByText('running…')).toBeInTheDocument()
	})

	it('falls back gracefully when the input has no recognizable command', () => {
		render(<ToolCallRow call={call({ tool_name: 'apply_patch', input: { diff: '…' } })} />)
		expect(screen.getByText('apply_patch')).toBeInTheDocument()
	})
})
