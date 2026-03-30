import type { ReactNode } from 'react'

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
			className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-white/5 ${
				active ? 'bg-white/5' : ''
			}`}
		>
			<span className="flex w-4 shrink-0 items-center justify-center">{icon}</span>
			<span className="font-data flex-1 text-[12px] text-silver">{label}</span>
			{hasValue ? <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400" /> : null}
			<span className="text-[10px] text-dim">&rsaquo;</span>
		</button>
	)
}
