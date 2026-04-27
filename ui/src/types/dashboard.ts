import type { StalledReason } from './events'
import type { LinkedPrSummary } from './pr'
import type { Run } from './runs'

export interface DistItem {
	label: string
	count: number
	color: string
}

export type OperatorQueue = 'waiting' | 'active' | 'in-pr' | 'done' | 'blocked-by-dependency' | 'needs-human'

export const OPERATOR_QUEUES: readonly OperatorQueue[] = [
	'waiting',
	'active',
	'in-pr',
	'done',
	'blocked-by-dependency',
	'needs-human'
] as const

export type SuspendReason =
	| { kind: 'pending_handoff'; handoff_id: string }
	| { kind: 'attention_requested'; attention_id: string }
	| { kind: 'other'; note: string }

export type OrchestrationOwner =
	| { kind: 'orchestrator' }
	| { kind: 'operator'; operator_id: string; note?: string | null }
	| { kind: 'suspended'; reason: SuspendReason }

export interface SessionOwnershipSnapshot {
	session_id: string
	run_id: string
	orchestration: OrchestrationOwner
	since: string
}

export interface QueueRunSummary extends Run {
	queue: OperatorQueue
	/**
	 * Server-supplied one-line reason (from `queue_card_reason` in
	 * superkick-core). Same field the launch queue reads, so dashboard and
	 * launch queue stay visually identical for the same run.
	 */
	reason: string
	pending_attention_count: number
	pending_interrupt_count: number
	pr?: LinkedPrSummary
	ownership: SessionOwnershipSnapshot[]
	/**
	 * SUP-73 — heartbeat-driven recovery annotation. `undefined` when the
	 * run is healthy. The run still lives in its `queue` bucket; staleness
	 * annotates without re-classifying. `stalled_for_seconds` measures the
	 * time since the underlying signal went silent (the classifier's
	 * `since`), not the time since the scheduler first noticed.
	 */
	stalled_for_seconds?: number
	stalled_reason?: StalledReason
}

export interface DashboardQueueResponse {
	generated_at: string
	groups: Record<OperatorQueue, QueueRunSummary[]>
}
