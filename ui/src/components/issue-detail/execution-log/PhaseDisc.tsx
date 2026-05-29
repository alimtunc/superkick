import type { Phase, PhaseStatus } from '@/types'
import { Icon } from '@/ui'

const STATUS_LABEL: Record<PhaseStatus, string> = {
	done: 'done',
	active: 'in progress',
	paused: 'paused',
	failed: 'failed',
	pending: 'pending'
}

function PhaseGlyph({ status }: { status: PhaseStatus }) {
	if (status === 'done') return <Icon name="check" size={10} className="ic" />
	if (status === 'failed') return <Icon name="x" size={9} className="ic" />
	if (status === 'paused') return <Icon name="pause" size={9} className="ic" />
	if (status === 'active')
		return <span className="agdot agdot--running" style={{ width: 6, height: 6 }} aria-hidden="true" />
	return null
}

interface PhaseDiscProps {
	phase: Phase
	label: string
}

export function PhaseDisc({ phase, label }: PhaseDiscProps) {
	return (
		<span
			role="group"
			aria-label={`${label} ${STATUS_LABEL[phase.status]}`}
			style={{ display: 'contents' }}
		>
			<span className="phase__dot">
				<PhaseGlyph status={phase.status} />
			</span>
			<span className="phase__label">
				{label}
				{phase.meta ? ` · ${phase.meta}` : ''}
			</span>
		</span>
	)
}
