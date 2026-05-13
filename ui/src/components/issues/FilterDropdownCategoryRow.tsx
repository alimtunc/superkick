import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { Menu } from '@base-ui/react/menu'
import { ChevronRight } from 'lucide-react'

export function FilterDropdownCategoryRow({
	icon,
	label,
	active,
	hasValue,
	onClick
}: {
	icon: ReactNode
	label: string
	active: boolean
	hasValue: boolean
	onClick: () => void
}) {
	return (
		<Menu.Item
			onClick={onClick}
			closeOnClick={false}
			className={cn(
				'flex h-8 w-full cursor-pointer items-center gap-2.5 px-3 text-left transition-colors focus-visible:outline-none',
				'data-highlighted:bg-raised',
				active ? 'bg-raised text-fg' : 'text-fg-muted hover:bg-raised hover:text-fg'
			)}
		>
			<span className="flex w-4 shrink-0 items-center justify-center">{icon}</span>
			<span className="flex-1 font-mono text-[12px]">{label}</span>
			{hasValue ? (
				<span className="inline-block size-1.5 rounded-full bg-accent" aria-hidden="true" />
			) : null}
			<ChevronRight size={12} strokeWidth={1.75} className="text-fg-dim" aria-hidden="true" />
		</Menu.Item>
	)
}
