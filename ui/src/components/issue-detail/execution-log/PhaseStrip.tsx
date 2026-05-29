import { PhaseDisc } from '@/components/issue-detail/execution-log/PhaseDisc'
import { LAUNCH_STEP_KIND_LABEL } from '@/lib/domain'
import { cn } from '@/lib/utils'
import type { Phase, PhaseStatus } from '@/types'

interface PhaseStripProps {
	phases: readonly Phase[]
}

const TONE_COLOR: Record<PhaseStatus, string> = {
	done: 'var(--color-success)',
	active: 'var(--color-info)',
	paused: 'var(--color-warn)',
	failed: 'var(--color-danger)',
	pending: 'var(--color-border)'
}

function Connector({ from, to }: { from: PhaseStatus; to: PhaseStatus }) {
	const solid = to === 'pending'
	return (
		<span
			className={cn('mx-3 h-[1.5px] min-w-6 flex-1 self-center', solid ? 'bg-border' : 'opacity-70')}
			style={
				solid
					? undefined
					: { backgroundImage: `linear-gradient(to right, ${TONE_COLOR[from]}, ${TONE_COLOR[to]})` }
			}
			aria-hidden="true"
		/>
	)
}

export function PhaseStrip({ phases }: PhaseStripProps) {
	return (
		<div className="flex items-center px-4 py-3.5" role="list" aria-label="Execution phases">
			{phases.map((phase, index) => (
				<div
					key={phase.kind}
					role="listitem"
					className={cn('flex items-center', index < phases.length - 1 ? 'flex-1' : null)}
				>
					<PhaseDisc phase={phase} index={index} label={LAUNCH_STEP_KIND_LABEL[phase.kind]} />
					{index < phases.length - 1 ? (
						<Connector from={phase.status} to={phases[index + 1].status} />
					) : null}
				</div>
			))}
		</div>
	)
}
