import { Pill } from '@/components/ui/pill'
import { fmtRelativeTime, isWithinUnblockWindow } from '@/lib/domain'

interface LaunchQueueUnblockBadgeProps {
	resolvedAt: string
	refTime: number
}

export function LaunchQueueUnblockBadge({ resolvedAt, refTime }: LaunchQueueUnblockBadgeProps) {
	if (!isWithinUnblockWindow(resolvedAt, refTime)) return null

	return (
		<Pill tone="success" size="xs" dot pulse title={`Unblocked ${fmtRelativeTime(resolvedAt)}`}>
			Unblocked
		</Pill>
	)
}
