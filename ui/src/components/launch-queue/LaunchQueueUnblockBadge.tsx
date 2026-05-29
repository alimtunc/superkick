import { Pill } from '@/components/ui/pill'
import { fmtRelativeTime, isWithinUnblockWindow } from '@/lib/domain'

interface LaunchQueueUnblockBadgeProps {
	resolvedAt: string
	refTime: number
}

/**
 * "Unblocked · <when>" affordance shown on downstream cards that transitioned
 * out of `Blocked` during the current session (SUP-81). Session-local:
 * disappears on reload by design — the workspace event feed remains the
 * authoritative audit trail.
 */
export function LaunchQueueUnblockBadge({ resolvedAt, refTime }: LaunchQueueUnblockBadgeProps) {
	if (!isWithinUnblockWindow(resolvedAt, refTime)) return null

	return (
		<Pill tone="success" size="xs" dot pulse title={`Unblocked ${fmtRelativeTime(resolvedAt)}`}>
			Unblocked
		</Pill>
	)
}
