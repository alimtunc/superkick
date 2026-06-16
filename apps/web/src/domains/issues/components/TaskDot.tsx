import { cn } from '@/lib/utils'
import type { TaskBadgeKind } from '@/types'

interface TaskDotProps {
	kind: TaskBadgeKind
	size?: number
	className?: string
}

const TONE_TITLE: Record<TaskBadgeKind, string> = {
	needs: 'Needs you',
	running: 'Running',
	review: 'In review',
	shipped: 'Shipped'
}

export function TaskDot({ kind, size, className }: TaskDotProps) {
	return (
		<span
			role="img"
			aria-label={TONE_TITLE[kind]}
			title={TONE_TITLE[kind]}
			style={size ? { width: size, height: size } : undefined}
			className={cn('agdot', `agdot--${kind}`, className)}
		/>
	)
}
