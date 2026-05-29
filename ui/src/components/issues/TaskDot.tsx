import { TASK_KIND_BG } from '@/lib/issues/taskBadge'
import { cn } from '@/lib/utils'
import type { TaskBadgeKind } from '@/types'

interface TaskDotProps {
	kind: TaskBadgeKind
	size?: 6 | 7 | 8
	className?: string
}

const TONE_TITLE: Record<TaskBadgeKind, string> = {
	needs: 'Needs you',
	running: 'Running',
	review: 'In review',
	shipped: 'Shipped'
}

const SIZE_CLASS: Record<NonNullable<TaskDotProps['size']>, string> = {
	6: 'size-1.5',
	7: 'size-[7px]',
	8: 'size-2'
}

const PULSE_RING: Partial<Record<TaskBadgeKind, string>> = {
	needs: '0 0 0 3px color-mix(in srgb, var(--color-warn) 18%, transparent)',
	running: '0 0 0 3px color-mix(in srgb, var(--color-info) 18%, transparent)'
}

export function TaskDot({ kind, size = 8, className }: TaskDotProps) {
	const ring = PULSE_RING[kind]

	return (
		<span
			role="img"
			aria-label={TONE_TITLE[kind]}
			title={TONE_TITLE[kind]}
			style={ring ? { boxShadow: ring } : undefined}
			className={cn(
				'inline-block shrink-0 rounded-full',
				SIZE_CLASS[size],
				TASK_KIND_BG[kind],
				ring ? 'sk-pulse motion-reduce:animate-none' : null,
				className
			)}
		/>
	)
}
