// Mirrors `superkick_core::conversation` and `superkick_core::protocol`.
// Hand-maintained because the backend does not emit a TS schema today.
import type { AgentProvider } from './agents'

export type ConversationStatus = 'active' | 'archived'

export type TurnStatus = 'pending' | 'streaming' | 'completed' | 'failed' | 'cancelled'

export type ConversationSubject = { kind: 'issue'; identifier: string } | { kind: 'run'; run_id: string }

export interface Conversation {
	id: string
	subject: ConversationSubject
	agent_id: string
	provider: AgentProvider
	status: ConversationStatus
	provider_session_id: string | null
	created_at: string
	updated_at: string
	last_turn_at: string | null
}

/**
 * Sidebar-shaped conversation: the base row plus a denormalised first user
 * prompt the server fetches alongside the list. Only returned by
 * `GET /conversations?issue_id|run_id=…`.
 */
export interface ConversationSummary extends Conversation {
	first_user_text: string | null
}

export interface UsageSnapshot {
	input_tokens: number | null
	output_tokens: number | null
	cache_read_tokens: number | null
	cache_creation_tokens: number | null
	cost_usd: string | null
}

export interface TurnFailure {
	code: string
	message: string
}

export interface Turn {
	id: string
	conversation_id: string
	seq: number
	user_text: string
	status: TurnStatus
	usage: UsageSnapshot | null
	error: TurnFailure | null
	cancel_reason: string | null
	created_at: string
	started_at: string | null
	finished_at: string | null
}

// `ProtocolEvent` variants. Each carries `seq` + `at` from the envelope
// flattened in.
export type TurnEventEnvelope =
	| { kind: 'session_meta'; seq: number; at: string; resume_key: string; label: string | null }
	| { kind: 'text_delta'; seq: number; at: string; block_id: string; text: string }
	| { kind: 'text_block'; seq: number; at: string; block_id: string; text: string }
	| { kind: 'thinking'; seq: number; at: string; block_id: string; text: string }
	| {
			kind: 'log'
			seq: number
			at: string
			level: 'debug' | 'info' | 'warn' | 'error'
			message: string
	  }
	| {
			kind: 'tool_use'
			seq: number
			at: string
			call_id: string
			tool_name: string
			input: unknown
	  }
	| {
			kind: 'tool_result'
			seq: number
			at: string
			call_id: string
			output: unknown
			is_error: boolean
	  }
	| ({ kind: 'usage'; seq: number; at: string } & UsageSnapshot)
	| {
			kind: 'completion'
			seq: number
			at: string
			summary: string | null
			usage: UsageSnapshot | null
	  }
	| {
			kind: 'failure'
			seq: number
			at: string
			code: string
			message: string
			usage: UsageSnapshot | null
	  }
	| { kind: 'cancelled'; seq: number; at: string; reason: string }

export interface TurnEvent {
	id: string
	turn_id: string
	envelope: TurnEventEnvelope
}

export interface ConversationDetail {
	conversation: Conversation
	turns: Turn[]
	events_by_turn: Record<string, TurnEvent[]>
}

export interface CreateConversationRequest {
	subject: ConversationSubject
	agent_id: string
	provider: AgentProvider
}

export type ChatPermissionMode = 'ask_before_edits' | 'edit_automatically' | 'plan_mode' | 'auto_mode'

export interface CreateTurnRequest {
	user_text: string
	permission_mode?: ChatPermissionMode
	model?: string
}

export interface CreateTurnResponse {
	turn_id: string
	conversation_id: string
	status: TurnStatus
}
