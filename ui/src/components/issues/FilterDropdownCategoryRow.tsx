import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

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
		<button
			type="button"
			onClick={onClick}
			className={cn(
				'flex h-8 w-full cursor-pointer items-center gap-2.5 px-3 text-left transition-colors focus-visible:outline-none',
				active ? 'bg-slate-deep text-fog' : 'text-silver hover:bg-slate-deep/40 hover:text-fog'
			)}
		>
			<span className="flex w-4 shrink-0 items-center justify-center">{icon}</span>
			<span className="font-data flex-1 text-[12px]">{label}</span>
			{hasValue ? (
				<span
					className="inline-block h-1.5 w-1.5 rounded-full bg-cyan"
					aria-hidden="true"
					aria-label="filter active"
				/>
			) : null}
			<span className="text-[10px] text-ash" aria-hidden="true">
				&rsaquo;
			</span>
		</button>
	)
}
