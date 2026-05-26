import { PhaseDisc } from '@/components/issue-detail/execution-log/PhaseDisc'
import { LAUNCH_STEP_KIND_LABEL } from '@/lib/domain'
import type { Phase } from '@/types'

interface PhaseStripProps {
	phases: readonly Phase[]
}

export function PhaseStrip({ phases }: PhaseStripProps) {
	return (
		<div className="flex items-center gap-3" role="list" aria-label="Execution phases">
			{phases.map((phase, index) => (
				<div key={phase.kind} role="listitem" className="flex items-center gap-3">
					<PhaseDisc phase={phase} label={LAUNCH_STEP_KIND_LABEL[phase.kind]} />
					{index < phases.length - 1 ? (
						<span className="h-px w-3 bg-border" aria-hidden="true" />
					) : null}
				</div>
			))}
		</div>
	)
}
