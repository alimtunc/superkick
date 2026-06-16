import { cn } from '@/lib/utils'
import type { PriorityIconKind } from '@/types'

type PriorityIconSize = 11 | 12 | 13 | 14 | 16

interface PriorityIconProps {
	kind: PriorityIconKind
	size?: PriorityIconSize
	className?: string
}

const LABEL: Record<PriorityIconKind, string> = {
	none: 'No priority',
	urgent: 'Urgent priority',
	high: 'High priority',
	medium: 'Medium priority',
	low: 'Low priority'
}

export function PriorityIcon({ kind, size = 16, className }: PriorityIconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
			role="img"
			aria-label={LABEL[kind]}
			className={cn('inline-block shrink-0 align-middle', className)}
		>
			<PriorityIconShape kind={kind} />
		</svg>
	)
}

const BAR = 'var(--priority-bar)'

function Bars({ on }: { on: 0 | 1 | 2 | 3 }) {
	// Three bottom-aligned bars (heights 5/9/13). "On" bars are solid; the rest
	// dim to 0.3 opacity. `on === 0` (no priority) dims all three to 0.4.
	const op = (i: number) => (on === 0 ? 0.4 : i < on ? 1 : 0.3)
	return (
		<>
			<rect x="2" y="11" width="3" height="5" rx="0.5" fill={BAR} opacity={op(0)} />
			<rect x="6.5" y="7" width="3" height="9" rx="0.5" fill={BAR} opacity={op(1)} />
			<rect x="11" y="3" width="3" height="13" rx="0.5" fill={BAR} opacity={op(2)} />
		</>
	)
}

function PriorityIconShape({ kind }: { kind: PriorityIconKind }) {
	switch (kind) {
		case 'none':
			return <Bars on={0} />
		case 'low':
			return <Bars on={1} />
		case 'medium':
			return <Bars on={2} />
		case 'high':
			return <Bars on={3} />
		case 'urgent':
			return (
				<>
					<rect x="1" y="1" width="14" height="14" rx="3" fill="var(--priority-urgent)" />
					<rect x="7.25" y="3.6" width="1.5" height="5.2" rx="0.75" fill="#fff" />
					<circle cx="8" cy="11.4" r="0.95" fill="#fff" />
				</>
			)
	}
}
