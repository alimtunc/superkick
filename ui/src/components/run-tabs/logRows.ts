import { deriveProtocolLogRows } from '@/lib/domain'
import type { EventLevel, RunEvent } from '@/types'

export interface LogRow {
	id: string
	seq: number
	source: string
	level: EventLevel
	message: string
	ts: string
}

const LEGACY_LOG_KINDS = new Set(['agent_output', 'command_output'])

export function buildLogRows(events: readonly RunEvent[]): LogRow[] {
	const seqById = new Map(events.map((event) => [event.id, event.seq]))

	const legacy: LogRow[] = events
		.filter((event) => LEGACY_LOG_KINDS.has(event.kind))
		.map((event) => ({
			id: event.id,
			seq: event.seq,
			source: event.kind === 'agent_output' ? 'agent' : 'shell',
			level: event.level,
			message: event.message,
			ts: event.ts
		}))

	const protocol: LogRow[] = deriveProtocolLogRows(events).map((row) => ({
		id: row.id,
		seq: seqById.get(row.id) ?? 0,
		source: row.label,
		level: row.level,
		message: row.message,
		ts: row.at
	}))

	return [...legacy, ...protocol].toSorted((a, b) => a.seq - b.seq || a.ts.localeCompare(b.ts))
}
