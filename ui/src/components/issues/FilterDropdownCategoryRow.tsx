import type { Ref } from 'react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'

interface FilterDropdownCategoryRowProps {
	ref?: Ref<HTMLDivElement>
	icon: ReactNode
	label: string
	hasValue: boolean
	className?: string
}

export function FilterDropdownCategoryRow({
	ref,
	icon,
	label,
	hasValue,
	className
}: FilterDropdownCategoryRowProps) {
	return (
		<div
			ref={ref}
			data-has-value={hasValue || undefined}
			className={cn(
				'flex h-8 w-full cursor-pointer items-center gap-2.5 px-3 text-left text-fg-muted transition-colors focus-visible:outline-none',
				'data-highlighted:bg-raised data-highlighted:text-fg data-popup-open:bg-raised data-popup-open:text-fg',
				className
			)}
		>
			<span className="flex w-4 shrink-0 items-center justify-center">{icon}</span>
			<span className="flex-1 font-mono text-[12px]">{label}</span>
			{hasValue ? (
				<span className="inline-block size-1.5 rounded-full bg-accent" aria-hidden="true" />
			) : null}
			<ChevronRight size={12} strokeWidth={1.75} className="text-fg-dim" aria-hidden="true" />
		</div>
	)
}
