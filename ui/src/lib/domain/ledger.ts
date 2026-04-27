import { humanize } from '@/lib/utils'
import type {
	AgentSession,
	AttentionRequest,
	CategoryVisual,
	EventKind,
	EventLevel,
	HandoffPayload,
	LedgerCategory,
	OwnershipPayload,
	RunEvent,
	SessionPayload
} from '@/types'

import { resolveProviderLabel } from './labels'

// Raw terminal streams (agent_output, command_output) are the supporting
// evidence surface, not the ledger — keep them out of this set.
const LEDGER_KINDS = new Set<EventKind>([
	'state_change',
	'step_started',
	'step_completed',
	'step_failed',
	'session_spawned',
	'session_completed',
	'session_failed',
	'session_cancelled',
	'handoff_created',
	'handoff_delivered',
	'handoff_completed',
	'handoff_failed',
	'attention_requested',
	'attention_replied',
	'attention_cancelled',
	'interrupt_created',
	'interrupt_resolved',
	'ownership_taken_over',
	'ownership_released',
	'ownership_suspended',
	'ownership_resumed',
	'review_completed',
	'external_attach',
	'operator_input',
	'budget_tripped',
	'approval_gate_entered',
	'error'
])

export function isLedgerEvent(event: RunEvent): boolean {
	return LEDGER_KINDS.has(event.kind)
}

export function categoryOf(kind: EventKind): LedgerCategory {
	switch (kind) {
		case 'state_change':
		case 'step_started':
		case 'step_completed':
		case 'step_failed':
		case 'review_completed':
			return 'step'
		case 'session_spawned':
		case 'session_completed':
		case 'session_failed':
		case 'session_cancelled':
			return 'session'
		case 'handoff_created':
		case 'handoff_delivered':
		case 'handoff_completed':
		case 'handoff_failed':
			return 'handoff'
		case 'attention_requested':
		case 'attention_replied':
		case 'attention_cancelled':
		case 'approval_gate_entered':
			return 'attention'
		case 'interrupt_created':
		case 'interrupt_resolved':
		case 'budget_tripped':
			return 'interrupt'
		case 'ownership_taken_over':
		case 'ownership_released':
		case 'ownership_suspended':
		case 'ownership_resumed':
			return 'ownership'
		case 'operator_input':
		case 'external_attach':
			return 'operator'
		case 'error':
			return 'error'
		default:
			return 'system'
	}
}

const CATEGORY_VISUAL: Record<LedgerCategory, CategoryVisual> = {
	step: { icon: '\u25cf', dot: 'bg-cyan', ring: 'ring-cyan/40', label: 'Step' },
	session: { icon: '\u25a3', dot: 'bg-violet', ring: 'ring-violet/40', label: 'Session' },
	handoff: { icon: '\u21c4', dot: 'bg-gold', ring: 'ring-gold/40', label: 'Handoff' },
	attention: { icon: '\u26a0', dot: 'bg-gold', ring: 'ring-gold/40', label: 'Attention' },
	interrupt: { icon: '\u25c6', dot: 'bg-gold', ring: 'ring-gold/40', label: 'Interrupt' },
	ownership: { icon: '\u29bf', dot: 'bg-silver', ring: 'ring-silver/30', label: 'Ownership' },
	operator: { icon: '\u2691', dot: 'bg-mineral', ring: 'ring-mineral/40', label: 'Operator' },
	system: { icon: '\u00b7', dot: 'bg-dim', ring: 'ring-dim/30', label: 'System' },
	error: { icon: '\u2717', dot: 'bg-oxide', ring: 'ring-oxide/40', label: 'Error' }
}

export function visualOf(kind: EventKind): CategoryVisual {
	return CATEGORY_VISUAL[categoryOf(kind)]
}

type Payload = Record<string, unknown>

export function payloadOf(event: RunEvent): Payload | null {
	if (event.payload_json === null || event.payload_json === undefined) return null
	if (typeof event.payload_json === 'object') return event.payload_json as Payload
	if (typeof event.payload_json === 'string') {
		try {
			const parsed = JSON.parse(event.payload_json) as unknown
			return typeof parsed === 'object' && parsed !== null ? (parsed as Payload) : null
		} catch {
			return null
		}
	}
	return null
}

export function ledgerTone(level: EventLevel, category: LedgerCategory): string {
	if (level === 'error') return 'text-oxide'
	if (level === 'warn') return 'text-gold'
	if (category === 'operator' || category === 'attention') return 'text-fog'
	return 'text-fog/90'
}

export function ledgerTitle(event: RunEvent, payload: Payload | null): string {
	switch (event.kind) {
		case 'session_spawned': {
			const p = (payload ?? {}) as SessionPayload
			const role = p.role ?? 'agent'
			const provider = resolveProviderLabel(p.provider)
			return provider ? `Spawned ${role} (${provider})` : `Spawned ${role}`
		}
		case 'session_completed':
			return `Session completed — ${sessionRole(payload)}`
		case 'session_failed': {
			const reason = (payload as SessionPayload | null)?.reason
			const base = `Session failed — ${sessionRole(payload)}`
			return reason ? `${base} (${reason})` : base
		}
		case 'session_cancelled':
			return `Session cancelled — ${sessionRole(payload)}`
		case 'handoff_created': {
			const p = (payload ?? {}) as HandoffPayload
			return `Handoff created — ${p.kind ?? 'unknown'} → ${p.to_role ?? '?'}`
		}
		case 'handoff_delivered':
			return 'Handoff delivered to fulfilling session'
		case 'handoff_completed':
			return 'Handoff completed'
		case 'handoff_failed':
			return 'Handoff failed'
		case 'attention_replied':
			return 'Operator replied to attention request'
		case 'attention_cancelled':
			return 'Attention request cancelled'
		case 'ownership_taken_over':
			return 'Operator took over orchestration'
		case 'ownership_released':
			return 'Operator released control'
		case 'ownership_suspended':
			return 'Orchestrator suspended'
		case 'ownership_resumed':
			return 'Orchestrator resumed'
		default:
			return event.message
	}
}

export function ledgerDetail(
	event: RunEvent,
	payload: Payload | null,
	sessionById: Map<string, AgentSession>,
	attentionById: Map<string, AttentionRequest>
): string | null {
	switch (categoryOf(event.kind)) {
		case 'session':
			return sessionDetail(payload as SessionPayload | null, sessionById)
		case 'handoff':
			return handoffDetail(payload as HandoffPayload | null, sessionById)
		case 'attention':
			return attentionDetail(payload, attentionById)
		case 'ownership':
			return ownershipDetail(payload as OwnershipPayload | null, sessionById)
		default:
			return null
	}
}

function sessionDetail(
	payload: SessionPayload | null,
	sessionById: Map<string, AgentSession>
): string | null {
	if (!payload) return null
	const parent = payload.parent_session_id ? sessionById.get(payload.parent_session_id) : undefined
	const bits: string[] = []
	if (payload.purpose) bits.push(payload.purpose)
	if (payload.launch_reason) bits.push(`via ${humanize(payload.launch_reason)}`)
	if (parent?.role) bits.push(`from ${parent.role}`)
	if (payload.handoff_id) bits.push('fulfils handoff')
	if (typeof payload.exit_code === 'number') bits.push(`exit ${payload.exit_code}`)
	return bits.length > 0 ? bits.join(' · ') : null
}

function handoffDetail(
	payload: HandoffPayload | null,
	sessionById: Map<string, AgentSession>
): string | null {
	if (!payload) return null
	const from = payload.from_session_id ? sessionById.get(payload.from_session_id) : undefined
	const to = payload.to_session_id ? sessionById.get(payload.to_session_id) : undefined
	const bits: string[] = []
	if (from?.role) bits.push(`from ${from.role}`)
	if (to?.role) bits.push(`to ${to.role}`)
	else if (payload.to_role) bits.push(`to ${payload.to_role}`)
	if (payload.parent_handoff) bits.push('retry')
	return bits.length > 0 ? bits.join(' · ') : null
}

function attentionDetail(
	payload: Payload | null,
	attentionById: Map<string, AttentionRequest>
): string | null {
	if (!payload) return null
	const id = typeof payload.id === 'string' ? payload.id : null
	const request = id ? attentionById.get(id) : undefined
	const title = request?.title ?? (typeof payload.title === 'string' ? payload.title : null)
	const replier =
		request?.replied_by ?? (typeof payload.replied_by === 'string' ? payload.replied_by : undefined)
	const bits: string[] = []
	if (title) bits.push(title)
	if (replier) bits.push(`by ${replier}`)
	return bits.length > 0 ? bits.join(' — ') : null
}

function ownershipDetail(
	payload: OwnershipPayload | null,
	sessionById: Map<string, AgentSession>
): string | null {
	if (!payload) return null
	const session = payload.session_id ? sessionById.get(payload.session_id) : undefined
	const bits: string[] = []
	if (session?.role) bits.push(`session ${session.role}`)
	if (payload.operator_id) bits.push(`operator ${payload.operator_id}`)
	if (payload.reason) bits.push(humanize(payload.reason))
	return bits.length > 0 ? bits.join(' · ') : null
}

function sessionRole(payload: Payload | null): string {
	return (payload as SessionPayload | null)?.role ?? 'agent'
}
