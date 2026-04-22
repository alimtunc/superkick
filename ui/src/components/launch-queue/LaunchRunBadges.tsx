import { Badge } from '@/components/dashboard/Badge'
import type { LaunchQueueItem } from '@/types'

interface LaunchRunBadgesProps {
	item: Extract<LaunchQueueItem, { kind: 'run' }>
}

export function LaunchRunBadges({ item }: LaunchRunBadgesProps) {
	return (
		<div className="flex items-center gap-1">
			{item.pending_attention_count > 0 ? (
				<Badge tone="oxide" label={`${item.pending_attention_count}!`} title="Pending attention" />
			) : null}
			{item.pending_interrupt_count > 0 ? (
				<Badge tone="gold" label={`${item.pending_interrupt_count}?`} title="Pending interrupts" />
			) : null}
			{item.pr ? (
				<Badge tone="violet" label={`#${item.pr.number}`} title={`PR ${item.pr.state}`} />
			) : null}
		</div>
	)
}
