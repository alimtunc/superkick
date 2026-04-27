import { Badge } from '@/components/dashboard/Badge'
import type { QueueRunSummary } from '@/types'

interface RunBadgesProps {
	run: QueueRunSummary
}

export function RunBadges({ run }: RunBadgesProps) {
	return (
		<div className="flex items-center gap-1">
			{run.pending_attention_count > 0 ? (
				<Badge tone="oxide" label={`${run.pending_attention_count}!`} title="Pending attention" />
			) : null}
			{run.pending_interrupt_count > 0 ? (
				<Badge tone="gold" label={`${run.pending_interrupt_count}?`} title="Pending interrupts" />
			) : null}
			{run.pr ? <Badge tone="violet" label={`#${run.pr.number}`} title={`PR ${run.pr.state}`} /> : null}
		</div>
	)
}
