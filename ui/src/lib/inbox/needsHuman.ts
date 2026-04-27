import type { LaunchQueueItem, NeedsHumanItem, NeedsHumanReasonKind, QueueRunSummary, Run } from '@/types'

interface DeriveInputs {
	launchItems: readonly LaunchQueueItem[]
	queueRuns: readonly QueueRunSummary[]
	runs: readonly Run[]
	now: number
}

const FAILED_RECENT_WINDOW_MS = 24 * 60 * 60 * 1000

const PRIORITY: Record<NeedsHumanReasonKind, number> = {
	awaiting_approval: 0,
	stalled: 1,
	interrupt_pending: 2,
	attention_pending: 3,
	budget_paused: 4,
	recently_failed: 5
}

export const NEEDS_HUMAN_REASON_LABEL: Record<NeedsHumanReasonKind, string> = {
	awaiting_approval: 'Approval',
	stalled: 'Stalled',
	interrupt_pending: 'Interrupt',
	attention_pending: 'Attention',
	budget_paused: 'Budget',
	recently_failed: 'Failed'
}

export const NEEDS_HUMAN_REASON_TONE: Record<NeedsHumanReasonKind, string> = {
	awaiting_approval: 'text-gold bg-gold-dim',
	stalled: 'text-gold bg-gold-dim',
	interrupt_pending: 'text-gold bg-gold-dim',
	attention_pending: 'text-oxide bg-oxide/10',
	budget_paused: 'text-gold bg-gold-dim',
	recently_failed: 'text-oxide bg-oxide/10'
}

/**
 * Compose the "Needs Human" list for the Inbox from three independent
 * sources. Each source emits zero or more candidates carrying a priority
 * weight; we then sort by PRIORITY (lower wins) and dedup by id, keeping
 * the highest-priority entry per run/issue.
 */
export function deriveNeedsHuman({ launchItems, queueRuns, runs, now }: DeriveInputs): NeedsHumanItem[] {
	const candidates: NeedsHumanItem[] = []

	for (const item of launchItems) {
		if (item.kind !== 'issue') continue
		if (item.bucket !== 'needs-human') continue
		candidates.push({
			id: `issue:${item.issue.id}`,
			priority: PRIORITY.awaiting_approval,
			reasonKind: 'awaiting_approval',
			reason: item.reason || 'Awaiting approval',
			source: { kind: 'launch-issue', item }
		})
	}

	for (const run of queueRuns) {
		if (run.stalled_for_seconds != null && run.stalled_reason != null) {
			candidates.push({
				id: `run:${run.id}`,
				priority: PRIORITY.stalled,
				reasonKind: 'stalled',
				reason: stalledReasonLabel(run),
				source: { kind: 'queue-run', run }
			})
			continue
		}
		if (run.pending_interrupt_count > 0) {
			candidates.push({
				id: `run:${run.id}`,
				priority: PRIORITY.interrupt_pending,
				reasonKind: 'interrupt_pending',
				reason: `${run.pending_interrupt_count} pending interrupt${
					run.pending_interrupt_count === 1 ? '' : 's'
				}`,
				source: { kind: 'queue-run', run }
			})
			continue
		}
		if (run.pending_attention_count > 0) {
			candidates.push({
				id: `run:${run.id}`,
				priority: PRIORITY.attention_pending,
				reasonKind: 'attention_pending',
				reason: `${run.pending_attention_count} attention request${
					run.pending_attention_count === 1 ? '' : 's'
				}`,
				source: { kind: 'queue-run', run }
			})
		}
	}

	for (const run of runs) {
		if (run.pause_kind === 'budget') {
			candidates.push({
				id: `run:${run.id}`,
				priority: PRIORITY.budget_paused,
				reasonKind: 'budget_paused',
				reason: run.pause_reason || 'Paused — budget approval needed',
				source: { kind: 'run', run }
			})
			continue
		}
		if (run.state === 'failed' && isRecent(run.finished_at ?? run.updated_at, now)) {
			candidates.push({
				id: `run:${run.id}`,
				priority: PRIORITY.recently_failed,
				reasonKind: 'recently_failed',
				reason: run.error_message ? truncate(run.error_message, 80) : 'Run failed — review needed',
				source: { kind: 'run', run }
			})
		}
	}

	candidates.sort((a, b) => a.priority - b.priority)

	const seen = new Set<string>()
	const out: NeedsHumanItem[] = []
	for (const candidate of candidates) {
		if (seen.has(candidate.id)) continue
		seen.add(candidate.id)
		out.push(candidate)
	}
	return out
}

function stalledReasonLabel(run: QueueRunSummary): string {
	const reason = run.stalled_reason
	if (!reason) return 'Stalled — no recent signal'
	switch (reason.kind) {
		case 'awaiting_human':
			return 'Stalled — awaiting human reply'
		case 'never_dispatched':
			return `Stalled — never dispatched (${reason.state})`
		case 'no_heartbeat':
			return `Stalled — no heartbeat from ${reason.state}`
	}
}

function isRecent(iso: string | null, now: number): boolean {
	if (!iso) return false
	const ts = Date.parse(iso)
	if (Number.isNaN(ts)) return false
	return now - ts <= FAILED_RECENT_WINDOW_MS
}

function truncate(value: string, max: number): string {
	if (value.length <= max) return value
	return `${value.slice(0, max - 1)}…`
}
