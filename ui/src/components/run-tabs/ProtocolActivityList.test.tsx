import { ProtocolActivityList } from '@/components/run-tabs/ProtocolActivityList'
import type { ProtocolEvent, RunEvent } from '@/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

let counter = 0

function protocolEvent(event: ProtocolEvent, overrides: Partial<RunEvent> = {}): RunEvent {
	counter += 1
	const seq = counter
	return {
		id: `evt-${seq}`,
		run_id: 'run-1',
		run_step_id: 'step-1',
		seq,
		ts: '2026-06-01T10:00:00.000Z',
		kind: 'agent_protocol',
		level: 'info',
		message: 'protocol',
		payload_json: { seq, at: '2026-06-01T10:00:00.000Z', ...event },
		...overrides
	}
}

describe('ProtocolActivityList', () => {
	it('renders a tool_use with its tool name and input summary', () => {
		render(
			<ProtocolActivityList
				events={[
					protocolEvent({
						kind: 'tool_use',
						call_id: 'c1',
						tool_name: 'apply_patch',
						input: { path: 'src/x.ts' }
					})
				]}
			/>
		)
		expect(screen.getByText('apply_patch')).toBeInTheDocument()
		expect(screen.getByText(/src\/x\.ts/)).toBeInTheDocument()
	})

	it('renders a paired tool_use + tool_result with an ok chip', () => {
		render(
			<ProtocolActivityList
				events={[
					protocolEvent({ kind: 'tool_use', call_id: 'c1', tool_name: 'read_file', input: {} }),
					protocolEvent({ kind: 'tool_result', call_id: 'c1', output: 'done', is_error: false })
				]}
			/>
		)
		expect(screen.getByText('read_file')).toBeInTheDocument()
		expect(screen.getByText('tool result')).toBeInTheDocument()
		expect(screen.getByText('ok')).toBeInTheDocument()
	})

	it('renders an errored tool_result with an error chip', () => {
		render(
			<ProtocolActivityList
				events={[
					protocolEvent({ kind: 'tool_result', call_id: 'c2', output: 'boom', is_error: true })
				]}
			/>
		)
		expect(screen.getByText('tool result (error)')).toBeInTheDocument()
		expect(screen.getByText('error')).toBeInTheDocument()
	})

	it('renders a warn log diagnostic with its message and a warn chip', () => {
		render(
			<ProtocolActivityList
				events={[
					protocolEvent({
						kind: 'log',
						level: 'warn',
						message: 'codex: unparseable jsonl: {garbage'
					})
				]}
			/>
		)
		expect(screen.getByText('log (warn)')).toBeInTheDocument()
		expect(screen.getByText('codex: unparseable jsonl: {garbage')).toBeInTheDocument()
		expect(screen.getByText('warn')).toBeInTheDocument()
	})

	it('renders text_block and thinking text', () => {
		render(
			<ProtocolActivityList
				events={[
					protocolEvent({ kind: 'text_block', block_id: 'b1', text: 'final answer here' }),
					protocolEvent({ kind: 'thinking', block_id: 'b2', text: 'let me reason' })
				]}
			/>
		)
		expect(screen.getByText('final answer here')).toBeInTheDocument()
		expect(screen.getByText('let me reason')).toBeInTheDocument()
	})

	it('renders usage token counts', () => {
		render(
			<ProtocolActivityList
				events={[protocolEvent({ kind: 'usage', input_tokens: 120, output_tokens: 45 })]}
			/>
		)
		expect(screen.getByText(/in 120/)).toBeInTheDocument()
		expect(screen.getByText(/out 45/)).toBeInTheDocument()
	})

	// Real serde output: `UsageSnapshot` has no skip_serializing_if, and the
	// Codex parser always sets cache_creation_tokens/cost_usd to None, so the
	// wire payload carries explicit nulls. The schema must accept them (not
	// drop the row). Regression for the `.optional()` → `.nullish()` fix.
	it('renders a usage row whose null fields mirror real serde output', () => {
		render(
			<ProtocolActivityList
				events={[
					protocolEvent({
						kind: 'usage',
						input_tokens: 29552,
						output_tokens: 61,
						cache_read_tokens: 18176,
						cache_creation_tokens: null,
						cost_usd: null
					})
				]}
			/>
		)
		expect(screen.getByText(/in 29552/)).toBeInTheDocument()
		expect(screen.getByText(/out 61/)).toBeInTheDocument()
	})

	it('renders a session_meta chip from the resume key', () => {
		render(
			<ProtocolActivityList
				events={[protocolEvent({ kind: 'session_meta', resume_key: 'thread_abc', label: null })]}
			/>
		)
		expect(screen.getByText('session: thread_abc')).toBeInTheDocument()
	})

	it('renders terminal completion / failure / cancelled rows', () => {
		const { rerender } = render(
			<ProtocolActivityList
				events={[protocolEvent({ kind: 'completion', summary: 'all green', usage: null })]}
			/>
		)
		expect(screen.getByText('Completed')).toBeInTheDocument()
		expect(screen.getByText('all green')).toBeInTheDocument()

		rerender(
			<ProtocolActivityList
				events={[
					protocolEvent({
						kind: 'failure',
						code: 'tool_error',
						message: 'patch rejected',
						usage: null
					})
				]}
			/>
		)
		expect(screen.getByText('Failed — tool_error')).toBeInTheDocument()
		expect(screen.getByText('patch rejected')).toBeInTheDocument()

		rerender(
			<ProtocolActivityList
				events={[protocolEvent({ kind: 'cancelled', reason: 'operator stopped' })]}
			/>
		)
		expect(screen.getByText('Cancelled')).toBeInTheDocument()
		expect(screen.getByText('operator stopped')).toBeInTheDocument()
	})

	it('orders rows by seq regardless of array order', () => {
		const later = protocolEvent({ kind: 'tool_use', call_id: 'c9', tool_name: 'second', input: {} })
		const earlier = protocolEvent({ kind: 'tool_use', call_id: 'c8', tool_name: 'first', input: {} })
		// Force seq inversion: `earlier` was created after `later` so has a higher seq.
		render(
			<ProtocolActivityList
				events={[
					{ ...later, seq: 1 },
					{ ...earlier, seq: 0 }
				]}
			/>
		)
		const names = screen.getAllByText(/first|second/).map((n) => n.textContent)
		expect(names).toEqual(['first', 'second'])
	})
})
