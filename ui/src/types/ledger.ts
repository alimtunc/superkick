export type LedgerCategory =
	| 'step'
	| 'session'
	| 'handoff'
	| 'attention'
	| 'interrupt'
	| 'ownership'
	| 'operator'
	| 'system'
	| 'error'

export interface CategoryVisual {
	icon: string
	dot: string
	ring: string
	label: string
}

export interface SessionPayload {
	session_id?: string
	provider?: string
	role?: string | null
	purpose?: string | null
	parent_session_id?: string | null
	launch_reason?: string | null
	handoff_id?: string | null
	exit_code?: number | null
	reason?: string | null
}

export interface HandoffPayload {
	id?: string
	kind?: string
	to_role?: string
	from_session_id?: string | null
	to_session_id?: string | null
	parent_handoff?: string | null
	status?: string
}

export interface AttentionPayload {
	id?: string
	kind?: string
	title?: string
	body?: string
	status?: string
	reply?: unknown
	replied_by?: string | null
}

export interface OwnershipPayload {
	session_id?: string
	from?: unknown
	to?: unknown
	reason?: string
	operator_id?: string | null
}
