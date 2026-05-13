import { fmtSecondsCompact } from '@/lib/domain'
import type { QueueRunSummary, StalledReason } from '@/types'

interface StalledBadgeProps {
	run: QueueRunSummary
}

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
