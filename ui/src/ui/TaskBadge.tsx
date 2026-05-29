import type { ReactNode } from 'react'

import { Pill, type PillTone } from '@/components/ui/pill'
import { TASK_KIND_BG } from '@/lib/issues/taskBadge'
import { cn } from '@/lib/utils'
import type { TaskBadgeKind } from '@/types'

import { Icon } from './Icon'

interface TaskBadgeProps {
	kind: TaskBadgeKind | null | undefined
	label?: ReactNode
	mono?: boolean
	className?: string
}

const TONE: Record<TaskBadgeKind, PillTone> = {
	needs: 'warn',
	running: 'info',
	review: 'accent',
	shipped: 'success'
}

const DEFAULT_LABEL: Record<TaskBadgeKind, string> = {
	needs: 'needs you',
	running: 'running',
	review: 'in review',
	shipped: 'shipped'
}

const LEADING_ICON: Partial<Record<TaskBadgeKind, ReactNode>> = {
	review: <Icon name="pr" size={11} />,
	shipped: <Icon name="check" size={11} />
}

export function TaskBadge({ kind, label, mono = false, className }: TaskBadgeProps) {
	if (!kind) return null
	const leading = kind === 'needs' || kind === 'running' ? <TaskBadgeDot kind={kind} /> : LEADING_ICON[kind]
	return (
		<Pill tone={TONE[kind]} size="xs" mono={mono} leading={leading} className={className}>
			{label ?? DEFAULT_LABEL[kind]}
		</Pill>
	)
}

function TaskBadgeDot({ kind }: { kind: 'needs' | 'running' }) {
	return (
		<span
			className={cn(
				'inline-block size-1.5 shrink-0 rounded-full',
				TASK_KIND_BG[kind],
				kind === 'running' ? 'sk-pulse motion-reduce:animate-none' : null
			)}
		/>
	)
}
