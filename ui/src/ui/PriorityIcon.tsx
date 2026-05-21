import { PRIORITY_META } from '@/lib/domain'
import { cn } from '@/lib/utils'
import type { PriorityIconKind } from '@/types'

type PriorityIconSize = 14 | 16

interface PriorityIconProps {
	kind: PriorityIconKind
	size?: PriorityIconSize
	className?: string
}

const TONE_CLASS: Record<PriorityIconKind, string> = {
	none: 'text-fg-dim',
	low: 'text-fg-dim',
	medium: 'text-fg-dim',
	high: 'text-fg-dim',
	urgent: 'text-danger'
}

const LABEL: Record<PriorityIconKind, string> = {
	none: 'No priority',
	urgent: 'Urgent priority',
	high: 'High priority',
	medium: 'Medium priority',
	low: 'Low priority'
}

export function priorityIconKindFromValue(value: number): PriorityIconKind {
	return PRIORITY_META[value]?.kind ?? 'none'
}

export function PriorityIcon({ kind, size = 14, className }: PriorityIconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
			role="img"
			aria-label={LABEL[kind]}
			className={cn('inline-block shrink-0', TONE_CLASS[kind], className)}
		>
			<PriorityIconShape kind={kind} />
		</svg>
	)
}

function PriorityIconShape({ kind }: { kind: PriorityIconKind }) {
	switch (kind) {
		case 'none':
			return (
				<>
					<circle cx="3.5" cy="8" r="1" fill="currentColor" />
					<circle cx="8" cy="8" r="1" fill="currentColor" />
					<circle cx="12.5" cy="8" r="1" fill="currentColor" />
				</>
			)
		case 'urgent':
			return (
				<>
					<rect x="1.5" y="1.5" width="13" height="13" rx="2.5" fill="currentColor" />
					<rect x="7.25" y="4" width="1.5" height="5" rx="0.75" fill="var(--color-canvas)" />
					<rect x="7.25" y="10.25" width="1.5" height="1.75" rx="0.75" fill="var(--color-canvas)" />
				</>
			)
		case 'high':
			return (
				<>
					<rect x="2" y="9" width="3" height="5" rx="1" fill="currentColor" />
					<rect x="6.5" y="6" width="3" height="8" rx="1" fill="currentColor" />
					<rect x="11" y="3" width="3" height="11" rx="1" fill="currentColor" />
				</>
			)
		case 'medium':
			return (
				<>
					<rect x="2" y="9" width="3" height="5" rx="1" fill="currentColor" />
					<rect x="6.5" y="6" width="3" height="8" rx="1" fill="currentColor" />
					<rect x="11" y="3" width="3" height="11" rx="1" fill="currentColor" fillOpacity="0.25" />
				</>
			)
		case 'low':
			return (
				<>
					<rect x="2" y="9" width="3" height="5" rx="1" fill="currentColor" />
					<rect x="6.5" y="6" width="3" height="8" rx="1" fill="currentColor" fillOpacity="0.25" />
					<rect x="11" y="3" width="3" height="11" rx="1" fill="currentColor" fillOpacity="0.25" />
				</>
			)
	}
}
