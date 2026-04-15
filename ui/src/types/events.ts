export type EventKind =
	| 'state_change'
	| 'step_started'
	| 'step_completed'
	| 'step_failed'
	| 'agent_output'
	| 'command_output'
	| 'interrupt_created'
	| 'interrupt_resolved'
	| 'review_completed'
	| 'error'
	| 'external_attach'
	| 'operator_input'
	| 'attention_requested'
	| 'attention_replied'
	| 'attention_cancelled'

export type EventLevel = 'debug' | 'info' | 'warn' | 'error'

export interface RunEvent {
	id: string
	run_id: string
	run_step_id: string | null
	ts: string
	kind: EventKind
	level: EventLevel
	message: string
	payload_json: string | null
}
