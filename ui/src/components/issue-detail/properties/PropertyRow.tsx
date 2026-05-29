import type { ReactNode } from 'react'

interface PropertyRowProps {
	label: string
	children: ReactNode
}

export function PropertyRow({ label, children }: PropertyRowProps) {
	return (
		<div className="grid min-h-7 cursor-pointer grid-cols-[92px_1fr] items-center gap-2 rounded-[5px] px-2 py-1.25 transition-colors hover:bg-raised">
			<span className="text-[12px] text-fg-dim">{label}</span>
			<div className="min-w-0 text-[12.5px] leading-5 text-fg">{children}</div>
		</div>
	)
}

export const PROPERTY_ROW_TRIGGER =
	'inline-flex w-full flex-wrap items-center gap-[7px] rounded-[5px] text-left focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none'
