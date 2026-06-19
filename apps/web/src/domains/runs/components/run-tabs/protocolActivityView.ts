import { stringifyForDisplay } from '@/lib/format/json'
import type { ProtocolEvent, ProtocolEventEnvelope, ProtocolUsage } from '@/types'
import type { SKIconName } from '@/types/icons'

export type ProtocolNodeTone = '' | 'accent' | 'success' | 'warn'

export interface ProtocolRowView {
	icon: SKIconName
	tone: ProtocolNodeTone
	title: string
	detail: string | null
	preview: string | null
	collapsible: boolean
	statusLabel: string | null
	statusTone: 'success' | 'danger' | 'warn' | 'info' | 'neutral' | null
}

const COLLAPSE_THRESHOLD = 200

function summarizeValue(value: unknown): string {
	const text = stringifyForDisplay(value)
	return text.length > 240 ? `${text.slice(0, 240)}…` : text
}

function usageSummary(usage: ProtocolUsage): string {
	const bits: string[] = []
	if (typeof usage.input_tokens === 'number') bits.push(`in ${usage.input_tokens}`)
	if (typeof usage.output_tokens === 'number') bits.push(`out ${usage.output_tokens}`)
	if (typeof usage.cache_read_tokens === 'number') bits.push(`cache-read ${usage.cache_read_tokens}`)
	if (typeof usage.cache_creation_tokens === 'number')
		bits.push(`cache-write ${usage.cache_creation_tokens}`)
	if (usage.cost_usd) bits.push(`$${usage.cost_usd}`)
	return bits.join(' · ')
}

function title(event: ProtocolEvent): string {
	switch (event.kind) {
		case 'session_meta':
			return `session: ${event.label ?? event.resume_key}`
		case 'text_block':
			return 'Assistant message'
		case 'thinking':
			return 'Thinking'
		case 'log':
			return `log (${event.level})`
		case 'tool_use':
			return event.tool_name
		case 'tool_result':
			return event.is_error ? 'tool result (error)' : 'tool result'
		case 'usage':
			return 'usage'
		case 'completion':
			return 'Completed'
		case 'failure':
			return `Failed — ${event.code}`
		case 'cancelled':
			return 'Cancelled'
		case 'text_delta':
			return 'Assistant message'
	}
}

function detail(event: ProtocolEvent): string | null {
	switch (event.kind) {
		case 'text_block':
		case 'thinking':
		case 'text_delta':
			return event.text || null
		case 'log':
			return event.message
		case 'tool_use':
			return summarizeValue(event.input)
		case 'tool_result':
			return summarizeValue(event.output)
		case 'usage':
			return usageSummary(event) || null
		case 'completion':
			return event.summary ?? (event.usage ? usageSummary(event.usage) : null)
		case 'failure':
			return event.message
		case 'cancelled':
			return event.reason
		case 'session_meta':
			return null
	}
}

function tone(event: ProtocolEvent): ProtocolNodeTone {
	switch (event.kind) {
		case 'failure':
			return 'warn'
		case 'cancelled':
			return 'warn'
		case 'completion':
			return 'success'
		case 'tool_result':
			return event.is_error ? 'warn' : 'success'
		case 'tool_use':
			return 'accent'
		case 'log':
			return event.level === 'error' || event.level === 'warn' ? 'warn' : ''
		default:
			return ''
	}
}

function icon(event: ProtocolEvent): SKIconName {
	switch (event.kind) {
		case 'tool_use':
		case 'tool_result':
			return 'terminal'
		case 'thinking':
			return 'spark'
		case 'text_block':
		case 'text_delta':
			return 'comment'
		case 'log':
			return event.level === 'error' || event.level === 'warn' ? 'alert' : 'doc'
		case 'usage':
			return 'zap'
		case 'completion':
			return 'check'
		case 'failure':
			return 'alert'
		case 'cancelled':
			return 'x'
		case 'session_meta':
			return 'bot'
	}
}

function status(
	event: ProtocolEvent
): { label: string; tone: 'success' | 'danger' | 'warn' | 'info' | 'neutral' } | null {
	switch (event.kind) {
		case 'tool_result':
			return event.is_error ? { label: 'error', tone: 'danger' } : { label: 'ok', tone: 'success' }
		case 'log':
			if (event.level === 'error') return { label: 'error', tone: 'danger' }
			if (event.level === 'warn') return { label: 'warn', tone: 'warn' }
			return null
		case 'failure':
			return { label: 'failed', tone: 'danger' }
		case 'cancelled':
			return { label: 'cancelled', tone: 'warn' }
		case 'completion':
			return { label: 'done', tone: 'success' }
		default:
			return null
	}
}

export function protocolRowView(envelope: ProtocolEventEnvelope): ProtocolRowView {
	const detailText = detail(envelope)
	const statusInfo = status(envelope)
	const collapsible = detailText !== null && detailText.length > COLLAPSE_THRESHOLD
	return {
		icon: icon(envelope),
		tone: tone(envelope),
		title: title(envelope),
		detail: detailText,
		preview: collapsible ? `${detailText.slice(0, COLLAPSE_THRESHOLD)}…` : detailText,
		collapsible,
		statusLabel: statusInfo?.label ?? null,
		statusTone: statusInfo?.tone ?? null
	}
}
