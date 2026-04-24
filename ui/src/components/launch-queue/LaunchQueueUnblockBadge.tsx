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
		<span
			className="font-data inline-flex items-center gap-1 self-start rounded border border-neon-green/40 bg-neon-green/10 px-1.5 py-0.5 text-[10px] text-neon-green"
			title={`Unblocked ${fmtRelativeTime(resolvedAt)}`}
		>
			<span className="h-1.5 w-1.5 rounded-full bg-neon-green" aria-hidden="true" />
			Unblocked
		</span>
	)
}
