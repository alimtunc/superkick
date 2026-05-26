import { PhaseDisc } from '@/components/issue-detail/execution-log/PhaseDisc'
import { LAUNCH_STEP_KIND_LABEL } from '@/lib/domain'
import { cn } from '@/lib/utils'
import type { Phase } from '@/types'

interface PhaseStripProps {
	phases: readonly Phase[]
}

export function PhaseStrip({ phases }: PhaseStripProps) {
	return (
		<div className="flex items-center gap-2" role="list" aria-label="Execution phases">
			{phases.map((phase, index) => (
				<div
					key={phase.kind}
					role="listitem"
					className={cn('flex items-center gap-2', index < phases.length - 1 ? 'flex-1' : null)}
				>
					<PhaseDisc phase={phase} index={index} label={LAUNCH_STEP_KIND_LABEL[phase.kind]} />
					{index < phases.length - 1 ? (
						<span className="h-px flex-1 bg-border" aria-hidden="true" />
					) : null}
				</div>
			))}
		</div>
	)
}
