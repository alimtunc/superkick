import { Pill } from '@/components/ui/pill'
import type { LaunchQueueActiveCapacity } from '@/types'

interface InboxCapacityBadgeProps {
	capacity: LaunchQueueActiveCapacity
}

/**
 * Compact inline replacement for `CapacityBanner` so the Inbox header keeps
 * a single visual rhythm with the other sections (which only have count
 * subtitles). Saturated state still announces itself via tone, no full
 * banner needed.
 */
export function InboxCapacityBadge({ capacity }: InboxCapacityBadgeProps) {
	const saturated = capacity.max > 0 && capacity.current >= capacity.max
	return (
		<Pill tone={saturated ? 'gold' : 'neutral'} size="xs" className="tracking-wider uppercase">
			{capacity.current}/{capacity.max} active{saturated ? ' · capped' : ''}
		</Pill>
	)
}
