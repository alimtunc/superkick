import type { ReactNode } from 'react'

interface SectionHeaderProps {
	title: string
	count?: number | null
	trailing?: ReactNode
}

export function SectionHeader({ title, count, trailing }: SectionHeaderProps) {
	return (
		<div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold tracking-[0.02em] text-fg-dim uppercase">
			<span>{title}</span>
			{typeof count === 'number' ? (
				<span className="font-mono text-[10px] tracking-normal">{count}</span>
			) : null}
			{trailing ? <span className="ml-auto">{trailing}</span> : null}
		</div>
	)
}
