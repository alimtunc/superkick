import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface KbdProps {
	children: ReactNode
	className?: string
}

export function Kbd({ children, className }: KbdProps) {
	return (
		<span
			className={cn(
				'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded px-[5px]',
				'border border-border bg-raised text-fg-muted',
				'font-mono text-[10.5px] font-medium',
				className
			)}
		>
			{children}
		</span>
	)
}
