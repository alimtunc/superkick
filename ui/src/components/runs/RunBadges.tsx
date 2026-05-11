import { Badge } from '@/components/dashboard/Badge'
import { runPillSlots } from '@/lib/runs/pillSlots'
import type { QueueRunSummary } from '@/types'

interface RunBadgesProps {
	run: QueueRunSummary
}

export function RunBadges({ run }: RunBadgesProps) {
	const slots = runPillSlots(run)
	return (
		<div className="flex items-center gap-1">
			{slots.attention ? (
				<Badge tone="oxide" label={`${slots.attention.count}!`} title="Pending attention" />
			) : null}
			{slots.interrupt ? (
				<Badge tone="gold" label={`${slots.interrupt.count}?`} title="Pending interrupts" />
			) : null}
			{slots.pr ? (
				<Badge tone="violet" label={`#${slots.pr.number}`} title={`PR ${slots.pr.state}`} />
			) : null}
		</div>
	)
}
