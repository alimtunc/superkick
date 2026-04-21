import type { OperatorQueue, QueueRunSummary, SessionOwnershipSnapshot } from '@/types'

interface QueueAccent {
	border: string
	text: string
	label: string
	icon: string
	description: string
}

/**
 * Visual accent + short operator-facing description per queue column. Every
 * surface (summary card, column header, jump target) reads the same fields so
 * the colour language, iconography, and copy stay in lockstep.
 */
export const queueAccent: Record<OperatorQueue, QueueAccent> = {
	waiting: {
		border: 'border-t-dim',
		text: 'text-silver',
		label: 'Waiting',
		icon: '--',
		description: 'Queued — not picked up yet.'
	},
	active: {
		border: 'border-t-cyan',
		text: 'text-cyan',
		label: 'Active',
		icon: '>>',
		description: 'In flight, no operator signal needed.'
	},
	'in-pr': {
		border: 'border-t-violet',
		text: 'text-violet',
		label: 'In PR',
		icon: '->',
		description: 'Pull request is open or draft — review or merge.'
	},
	done: {
		border: 'border-t-mineral',
		text: 'text-mineral',
		label: 'Done',
		icon: 'OK',
		description: 'Completed — recently shipped runs.'
	},
	// Passive wait: the system is blocked on itself (pending handoff).
	// Muted gold so it reads as "paused" rather than "alert".
	'blocked-by-dependency': {
		border: 'border-t-gold/60',
		text: 'text-gold/80',
		label: 'Blocked — dependency',
		icon: '::',
		description: 'System paused waiting for a handoff.'
	},
	// Urgent action required from the operator — only column that reads red.
	'needs-human': {
		border: 'border-t-oxide',
		text: 'text-oxide',
		label: 'Needs human',
		icon: '!!',
		description: 'Attention, interrupt, or failure — act now.'
	}
}

/**
 * Only the "Needs human" column demands immediate operator action, so it's the
 * only summary card that glows red. Other columns (including "Blocked") read
 * as passive — they're waiting, not alarming.
 */
export function isUrgentQueue(queue: OperatorQueue, count: number): boolean {
	return count > 0 && queue === 'needs-human'
}

/**
 * Pick a concise one-line reason an operator card should show next to the
 * run. Leans on the strongest signal: pending attention first (since it is
 * what the operator has to actually do), then pending interrupts, then the
 * run-level state (failed / waiting_human), then the PR state.
 */
export function queueCardReason(run: QueueRunSummary): string | null {
	if (run.pending_attention_count > 0) {
		return run.pending_attention_count === 1
			? '1 attention request pending'
			: `${run.pending_attention_count} attention requests pending`
	}
	if (run.pending_interrupt_count > 0) {
		return run.pending_interrupt_count === 1
			? '1 interrupt pending'
			: `${run.pending_interrupt_count} interrupts pending`
	}
	if (run.state === 'failed') return 'Run failed — retry or archive'
	if (run.state === 'waiting_human') return 'Waiting on human'
	const handoff = pendingHandoff(run.ownership)
	if (handoff) return 'Paused — handoff pending'
	if (run.pr) {
		if (run.pr.state === 'draft') return `Draft PR #${run.pr.number}`
		if (run.pr.state === 'open') return `Open PR #${run.pr.number}`
	}
	if (run.state === 'queued') return 'Queued'
	return null
}

export function pendingHandoff(ownership: SessionOwnershipSnapshot[]): SessionOwnershipSnapshot | undefined {
	return ownership.find(
		(o) => o.orchestration.kind === 'suspended' && o.orchestration.reason.kind === 'pending_handoff'
	)
}
