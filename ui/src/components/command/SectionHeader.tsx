import type { ReactNode } from 'react'

interface SectionHeaderProps {
	title: string
	count?: number | null
	trailing?: ReactNode
}

export function SectionHeader({ title, count, trailing }: SectionHeaderProps) {
	return (
		<div className="flex items-center gap-1.5 px-4 pt-2.5 pb-1 text-[10.5px] font-semibold tracking-wider text-fg-dim uppercase">
			<span>{title}</span>
			{typeof count === 'number' ? (
				<span className="font-mono text-[10px] tracking-normal">{count}</span>
			) : null}
			{trailing ? <span className="ml-auto">{trailing}</span> : null}
		</div>
	)
}
