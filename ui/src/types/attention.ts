export type AttentionKind = 'clarification' | 'decision' | 'approval'
export type AttentionStatus = 'pending' | 'replied' | 'cancelled'

export type AttentionReply =
	| { kind: 'text'; text: string }
	| { kind: 'choice'; choice: string }
	| { kind: 'approval'; approved: boolean; reason?: string }

export interface AttentionRequest {
	id: string
	run_id: string
	kind: AttentionKind
	title: string
	body: string
	options?: string[] | null
	status: AttentionStatus
	reply?: AttentionReply | null
	replied_by?: string | null
	created_at: string
	replied_at?: string | null
}

export interface AttentionSummary {
	pendingAttention: number
	pendingInterrupts: number
	total: number
}
