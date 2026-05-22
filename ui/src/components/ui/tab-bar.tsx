import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

export interface TabBarItem<TId extends string> {
	id: TId
	label: string
	icon: LucideIcon
}

interface TabBarProps<TId extends string> {
	tabs: readonly TabBarItem<TId>[]
	activeId: TId
	onChange: (id: TId) => void
	ariaLabel: string
	className?: string
}

export function TabBar<TId extends string>({
	tabs,
	activeId,
	onChange,
	ariaLabel,
	className
}: TabBarProps<TId>) {
	return (
		<div
			role="tablist"
			aria-label={ariaLabel}
			className={cn('flex shrink-0 items-center gap-0 border-b px-2', className)}
		>
			{tabs.map((descriptor) => {
				const active = descriptor.id === activeId
				const Cmp = descriptor.icon
				return (
					<button
						key={descriptor.id}
						role="tab"
						type="button"
						aria-selected={active}
						onClick={() => onChange(descriptor.id)}
						className={cn(
							'inline-flex h-10 items-center gap-1.5 border-b-2 px-3 text-[12.5px] font-medium transition-colors',
							active
								? 'border-accent text-fg'
								: 'border-transparent text-fg-muted hover:text-fg'
						)}
					>
						<Cmp size={14} strokeWidth={1.85} aria-hidden="true" />
						{descriptor.label}
					</button>
				)
			})}
		</div>
	)
}
