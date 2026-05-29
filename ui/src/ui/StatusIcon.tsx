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

const STATUS_COLOR: Record<StatusIconKind, string> = {
	backlog: 'var(--status-backlog)',
	todo: 'var(--status-todo)',
	progress: 'var(--status-progress)',
	review: 'var(--status-review)',
	done: 'var(--status-done)',
	cancelled: 'var(--status-cancelled)',
	needs: 'var(--status-needs)'
}

const LABEL: Record<StatusIconKind, string> = {
	backlog: 'Backlog',
	todo: 'Todo',
	progress: 'In progress',
	needs: 'Needs you',
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
			style={{ color: color ?? STATUS_COLOR[kind] }}
			className={cn('inline-block shrink-0 align-middle', className)}
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
					r="6"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeDasharray="1.6 2.2"
					strokeLinecap="round"
				/>
			)
		case 'todo':
			return <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
		case 'progress':
			return (
				<>
					<circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
					<circle
						cx="8"
						cy="8"
						r="3"
						stroke="currentColor"
						strokeWidth="6"
						strokeDasharray="11.3 18.85"
						transform="rotate(-90 8 8)"
					/>
				</>
			)
		case 'review':
			return (
				<>
					<circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
					<circle
						cx="8"
						cy="8"
						r="3"
						stroke="currentColor"
						strokeWidth="6"
						strokeDasharray="15.4 18.85"
						transform="rotate(-90 8 8)"
					/>
				</>
			)
		case 'done':
			return (
				<>
					<circle cx="8" cy="8" r="7" fill="currentColor" />
					<path
						d="M5 8.2l2 2 4-4.2"
						stroke="#07140d"
						strokeWidth="1.6"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</>
			)
		case 'cancelled':
			return (
				<>
					<circle cx="8" cy="8" r="7" fill="currentColor" />
					<path
						d="M5.5 5.5l5 5M10.5 5.5l-5 5"
						stroke="var(--bg-app)"
						strokeWidth="1.6"
						strokeLinecap="round"
					/>
				</>
			)
		case 'needs':
			return (
				<>
					<circle cx="8" cy="8" r="7" fill="currentColor" />
					<path d="M8 4.4v4.3" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
					<circle cx="8" cy="11.3" r="0.95" fill="#fff" />
				</>
			)
	}
}
