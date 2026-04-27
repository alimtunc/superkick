import { fmtSecondsCompact } from '@/lib/domain'
import type { QueueRunSummary, StalledReason } from '@/types'

interface StalledBadgeProps {
	run: QueueRunSummary
}

/**
 * SUP-73 — surfaces the recovery scheduler's "Stalled · {duration} · {reason}"
 * annotation on a queue card. The run still lives in its current bucket; this
 * is an annotation, not a re-classification. Renders nothing when the run is
 * healthy. Amber tone (gold-dim) marks operator attention without escalating
 * to oxide / red.
 *
 * Accessibility: rendered as a `role="status"` polite live region so
 * assistive tech announces the badge appearing asynchronously when the queue
 * refreshes. The compact visible label carries the duration; the structured
 * reason is exposed to screen readers via a `sr-only` span so `aria-label`
 * does not have to fight the visible text for precedence.
 */
export function StalledBadge({ run }: StalledBadgeProps) {
	const ageSecs = run.stalled_for_seconds
	const reason = run.stalled_reason
	if (ageSecs == null || reason == null) return null

	const duration = fmtSecondsCompact(ageSecs)
	const humanReason = humanizeReason(reason)
	return (
		<span
			role="status"
			className="font-data inline-flex items-center gap-1 rounded bg-gold-dim px-1.5 py-px text-[9px] leading-tight tracking-wider text-gold"
		>
			<span aria-hidden="true">◆</span>
			<span>Stalled · {duration}</span>
			<span className="sr-only"> — {humanReason}</span>
		</span>
	)
}

function humanizeReason(reason: StalledReason): string {
	switch (reason.kind) {
		case 'awaiting_human':
			return 'awaiting human reply'
		case 'never_dispatched':
			return `never dispatched (${reason.state})`
		case 'no_heartbeat':
			return `no heartbeat from ${reason.state}`
		default: {
			const _exhaustive: never = reason
			return _exhaustive
		}
	}
}
