import { MetricBadge } from '@/domains/dashboard/components/MetricBadge'
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
				<MetricBadge tone="danger" label={`${slots.attention.count}!`} title="Pending attention" />
			) : null}
			{slots.interrupt ? (
				<MetricBadge tone="warn" label={`${slots.interrupt.count}?`} title="Pending interrupts" />
			) : null}
			{slots.pr ? (
				<MetricBadge tone="accent" label={`#${slots.pr.number}`} title={`PR ${slots.pr.state}`} />
			) : null}
		</div>
	)
}
