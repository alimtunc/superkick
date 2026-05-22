import { TASK_KIND_BG } from '@/lib/issues/taskBadge'
import { cn } from '@/lib/utils'
import type { TaskBadgeKind } from '@/types'

interface TaskDotProps {
	kind: TaskBadgeKind
	size?: 6 | 8
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
	8: 'size-2'
}

export function TaskDot({ kind, size = 6, className }: TaskDotProps) {
	return (
		<span
			role="img"
			aria-label={TONE_TITLE[kind]}
			title={TONE_TITLE[kind]}
			className={cn(
				'inline-block shrink-0 rounded-full',
				SIZE_CLASS[size],
				TASK_KIND_BG[kind],
				kind === 'running' ? 'live-pulse motion-reduce:animate-none' : null,
				className
			)}
		/>
	)
}
