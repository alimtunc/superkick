import { cn } from '@/lib/utils'
import type { LinearStateType, StatusIconKind } from '@/types'

type StatusIconSize = 12 | 13 | 14 | 16

interface StatusIconProps {
	kind: StatusIconKind
	size?: StatusIconSize
	color?: string
	className?: string
}

const LINEAR_STATE_TO_KIND: Record<LinearStateType, StatusIconKind> = {
	backlog: 'backlog',
	unstarted: 'todo',
	started: 'progress',
	completed: 'done',
	canceled: 'cancelled'
}

export function statusIconKindFromLinear(stateType: LinearStateType): StatusIconKind {
	return LINEAR_STATE_TO_KIND[stateType]
}

/**
 * Linear's stock workflow collapses "In Progress" and "In Review" into
 * state_type='started' — the only signal that survives is the name. Promote
 * any review-flavored status to the dedicated `review` glyph (filled disc
 * with check), otherwise fall back to the state_type mapping.
 */
export function statusIconKindFor(status: { state_type: LinearStateType; name: string }): StatusIconKind {
	const name = status.name.toLowerCase()
	if (status.state_type === 'started' && name.includes('review')) return 'review'
	return LINEAR_STATE_TO_KIND[status.state_type]
}

const TONE_CLASS: Record<StatusIconKind, string> = {
	backlog: 'text-fg-dim',
	todo: 'text-fg-muted',
	progress: 'text-info',
	needs: 'text-warn',
	review: 'text-warn',
	done: 'text-success',
	cancelled: 'text-fg-dim'
}

const LABEL: Record<StatusIconKind, string> = {
	backlog: 'Backlog',
	todo: 'Todo',
	progress: 'In progress',
	needs: 'Needs human',
	review: 'In review',
	done: 'Done',
	cancelled: 'Cancelled'
}

export function StatusIcon({ kind, size = 14, color, className }: StatusIconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
			role="img"
			aria-label={LABEL[kind]}
			style={color ? { color } : undefined}
			className={cn('inline-block shrink-0', color ? null : TONE_CLASS[kind], className)}
		>
			<StatusIconShape kind={kind} />
		</svg>
	)
}

function StatusIconShape({ kind }: { kind: StatusIconKind }) {
	switch (kind) {
		case 'backlog':
			return (
				<circle
					cx="8"
					cy="8"
					r="6.25"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeDasharray="2 2"
				/>
			)
		case 'todo':
			return <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
		case 'progress':
			return (
				<>
					<circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
					<path d="M8 8 V 1.75 A 6.25 6.25 0 0 1 14.25 8 Z" fill="currentColor" />
				</>
			)
		case 'needs':
			return (
				<>
					<circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
					<path d="M8 8 V 1.75 A 6.25 6.25 0 0 1 8 14.25 Z" fill="currentColor" />
				</>
			)
		case 'review':
			return (
				<>
					<circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
					<path
						d="M8 1.75 A 6.25 6.25 0 0 1 14.25 8 A 6.25 6.25 0 0 1 8 14.25 L 8 8 Z"
						fill="currentColor"
					/>
				</>
			)
		case 'done':
			return (
				<>
					<circle cx="8" cy="8" r="6.25" fill="currentColor" />
					<path
						d="m5 8 2 2 4-4"
						stroke="var(--color-canvas)"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</>
			)
		case 'cancelled':
			return (
				<>
					<circle cx="8" cy="8" r="6.25" fill="currentColor" />
					<path
						d="m5.5 5.5 5 5 m0-5-5 5"
						stroke="var(--color-canvas)"
						strokeWidth="1.5"
						strokeLinecap="round"
					/>
				</>
			)
	}
}
