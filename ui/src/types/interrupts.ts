export type InterruptStatus = 'pending' | 'resolved' | 'dismissed'

export interface Interrupt {
	id: string
	run_id: string
	run_step_id: string | null
	question: string
	context_json: unknown | null
	status: InterruptStatus
	answer_json: unknown | null
	created_at: string
	resolved_at: string | null
}

export type InterruptAction =
	| { action: 'retry_step' }
	| { action: 'continue_with_note'; note: string }
	| { action: 'abort_run' }
