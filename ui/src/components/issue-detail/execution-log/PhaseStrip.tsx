import { PhaseDisc } from '@/components/issue-detail/execution-log/PhaseDisc'
import { LAUNCH_STEP_KIND_LABEL } from '@/lib/domain'
import type { Phase, PhaseStatus } from '@/types'

const BAR_CLASS: Record<PhaseStatus, string> = {
	done: 'filled',
	active: 'partial',
	paused: 'partial',
	failed: '',
	pending: ''
}

export function PhaseStrip({ phases }: { phases: readonly Phase[] }) {
	return (
		<div className="phases" role="list" aria-label="Execution phases">
			{phases.map((phase, index) => {
				const last = index === phases.length - 1
				return (
					<div key={phase.kind} role="listitem" className={`phase phase--${phase.status}`}>
						<PhaseDisc phase={phase} label={LAUNCH_STEP_KIND_LABEL[phase.kind]} />
						{last ? null : <span className={`phase__bar ${BAR_CLASS[phase.status]}`} />}
					</div>
				)
			})}
		</div>
	)
}
