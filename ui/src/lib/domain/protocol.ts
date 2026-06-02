import { parseProtocolEnvelope } from '@/types'
import type { ProtocolEventEnvelope, RunEvent, RunToolCall } from '@/types'

export interface ProtocolRow {
	event: RunEvent
	envelope: ProtocolEventEnvelope
}

export function isProtocolEvent(event: RunEvent): boolean {
	return event.kind === 'agent_protocol'
}

export function hasProtocolActivity(events: readonly RunEvent[]): boolean {
	return events.some(isProtocolEvent)
}

export function protocolRows(events: readonly RunEvent[]): ProtocolRow[] {
	const rows: ProtocolRow[] = []
	for (const event of events) {
		if (!isProtocolEvent(event)) continue
		const envelope = parseProtocolEnvelope(event.payload_json)
		if (envelope) rows.push({ event, envelope })
	}
	rows.sort((a, b) => a.event.seq - b.event.seq)
	return rows
}

// Pairs `tool_use` with its `tool_result` by `call_id`. A `tool_use` without a
// matching result is still running (`output === null`).
export function deriveProtocolToolCalls(events: readonly RunEvent[]): RunToolCall[] {
	const rows = protocolRows(events)
	const results = new Map<string, { output: unknown; is_error: boolean }>()
	for (const { envelope } of rows) {
		if (envelope.kind === 'tool_result') {
			results.set(envelope.call_id, { output: envelope.output, is_error: envelope.is_error })
		}
	}
	const calls: RunToolCall[] = []
	for (const { event, envelope } of rows) {
		if (envelope.kind !== 'tool_use') continue
		const paired = results.get(envelope.call_id) ?? null
		calls.push({
			call_id: envelope.call_id,
			tool_name: envelope.tool_name,
			conversation_id: '',
			turn_id: event.run_id,
			at: envelope.at,
			input: envelope.input,
			output: paired?.output ?? null,
			is_error: paired?.is_error ?? false
		})
	}
	return calls
}

// One-line preview of a tool call's input for the collapsed row, so a
// command_execution shows the actual command instead of just its tool name.
// Falls back to the first string field, then null (the row still expands to
// the full payload).
export function toolInputSummary(input: unknown): string | null {
	if (typeof input === 'string') return input.trim() || null
	if (!input || typeof input !== 'object') return null
	const obj = input as Record<string, unknown>
	for (const key of ['command', 'cmd', 'path', 'file', 'query']) {
		const value = obj[key]
		if (typeof value === 'string' && value.trim()) return value.trim()
	}
	return null
}

export interface ProtocolLogRow {
	id: string
	at: string
	source: 'log' | 'text'
	level: 'debug' | 'info' | 'warn' | 'error'
	label: string
	message: string
}

// Surfaces the human-readable slice of the protocol stream for the Logs tab:
// `log` rows (incl. the invalid-JSONL warn diagnostics) and coalesced text/thinking.
export function deriveProtocolLogRows(events: readonly RunEvent[]): ProtocolLogRow[] {
	const rows: ProtocolLogRow[] = []
	for (const { event, envelope } of protocolRows(events)) {
		if (envelope.kind === 'log') {
			rows.push({
				id: event.id,
				at: envelope.at,
				source: 'log',
				level: envelope.level,
				label: 'log',
				message: envelope.message
			})
			continue
		}
		if (envelope.kind === 'text_block' || envelope.kind === 'thinking') {
			rows.push({
				id: event.id,
				at: envelope.at,
				source: 'text',
				level: 'info',
				label: envelope.kind === 'thinking' ? 'thinking' : 'text',
				message: envelope.text
			})
		}
	}
	return rows
}
