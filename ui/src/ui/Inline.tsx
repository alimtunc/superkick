import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface InlineProps {
	children: ReactNode
	className?: string
}

export function Inline({ children, className }: InlineProps) {
	return (
		<span
			className={cn(
				'inline-flex items-center gap-1 rounded-[4px] border border-border bg-raised px-[5px] text-[12px] whitespace-nowrap text-fg',
				className
			)}
		>
			{children}
		</span>
	)
}
