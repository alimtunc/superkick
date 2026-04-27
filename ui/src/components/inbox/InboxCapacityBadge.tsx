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
	const tone = saturated ? 'text-gold' : 'text-dim'
	return (
		<span className={`font-data text-[10px] tracking-wider uppercase ${tone}`}>
			{capacity.current}/{capacity.max} active{saturated ? ' · capped' : ''}
		</span>
	)
}
