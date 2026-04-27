import type { Run } from '@/types'
import { Clock } from 'lucide-react'

interface RunPauseBudgetBannerProps {
	run: Run
}

/**
 * Budget-trip variant — hard stop demanding intervention. `role="alert"` so
 * screen readers announce immediately rather than waiting for the next polite
 * pause. Resolution controls live in the Interrupts panel below; we deliberately
 * don't duplicate the action buttons here (one source of truth per action).
 */
export function RunPauseBudgetBanner({ run }: RunPauseBudgetBannerProps) {
	return (
		<div
			role="alert"
			className="mb-5 flex items-start gap-3 rounded-md border border-gold/30 bg-gold/10 p-3"
			data-pause-kind="budget"
		>
			<Clock size={16} className="mt-0.5 text-gold" aria-hidden="true" />
			<div className="min-w-0 flex-1">
				<p className="font-data text-[11px] tracking-wider text-gold uppercase">Budget tripped</p>
				<p className="mt-1 text-sm text-fog">{run.pause_reason ?? 'No reason recorded.'}</p>
				<p className="font-data mt-1 text-[11px] text-dim">
					Override to continue or abort the run below (Interrupts panel).
				</p>
			</div>
		</div>
	)
}
