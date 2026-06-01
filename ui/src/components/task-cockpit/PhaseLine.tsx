import { LAUNCH_STEP_KIND_LABEL } from '@/lib/domain'
import type { LaunchTaskStep } from '@/types'
import { ChevronRight } from 'lucide-react'

export function PhaseLine({ step }: { step: LaunchTaskStep }) {
	return (
		<div className="flex items-center gap-2 text-[12px] text-fg-muted">
			<ChevronRight size={13} strokeWidth={1.85} className="text-fg-dim" aria-hidden="true" />
			<span className="font-data text-[11px] font-semibold tracking-wider text-success uppercase">
				{LAUNCH_STEP_KIND_LABEL[step.step_kind]}
			</span>
			<span className="font-data text-[11px]">· {step.status}</span>
		</div>
	)
}
