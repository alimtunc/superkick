import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
	icon?: LucideIcon
	title: string
	description?: string
	action?: ReactNode
	className?: string
	density?: 'compact' | 'default'
}

export function EmptyState({
	icon: Icon,
	title,
	description,
	action,
	className,
	density = 'default'
}: EmptyStateProps) {
	const compact = density === 'compact'
	return (
		<div
			className={cn(
				'flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-edge text-center',
				compact ? 'px-4 py-4' : 'px-6 py-10',
				className
			)}
		>
			{Icon ? (
				<Icon size={compact ? 16 : 20} strokeWidth={1.75} className="text-ash" aria-hidden="true" />
			) : null}
			<p className={cn('font-medium text-silver', compact ? 'text-xs' : 'text-sm')}>{title}</p>
			{description ? (
				<p className={cn('max-w-sm text-ash', compact ? 'text-[11px]' : 'text-xs')}>{description}</p>
			) : null}
			{action ? <div className={cn(compact ? 'mt-1' : 'mt-2')}>{action}</div> : null}
		</div>
	)
}
