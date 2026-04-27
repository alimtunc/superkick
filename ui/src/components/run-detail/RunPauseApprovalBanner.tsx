import type { Run } from '@/types'
import { AlertTriangle } from 'lucide-react'

interface RunPauseApprovalBannerProps {
	run: Run
}

/**
 * Approval-checkpoint variant — non-blocking notification, polite live region
 * so the announcement doesn't interrupt other operator activity. Resolution
 * controls live in the "Needs your decision" attention panel below.
 */
export function RunPauseApprovalBanner({ run }: RunPauseApprovalBannerProps) {
	return (
		<div
			role="status"
			aria-live="polite"
			className="mb-5 flex items-start gap-3 rounded-md border border-gold/30 bg-gold/10 p-3"
			data-pause-kind="approval"
		>
			<AlertTriangle size={16} className="mt-0.5 text-gold" aria-hidden="true" />
			<div className="min-w-0 flex-1">
				<p className="font-data text-[11px] tracking-wider text-gold uppercase">Approval required</p>
				<p className="mt-1 text-sm text-fog">{run.pause_reason ?? 'No reason recorded.'}</p>
				<p className="font-data mt-1 text-[11px] text-dim">
					Approve or reject the checkpoint below (Needs your decision).
				</p>
			</div>
		</div>
	)
}
