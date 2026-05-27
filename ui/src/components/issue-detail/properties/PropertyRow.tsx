import type { ReactNode } from 'react'

interface PropertyRowProps {
	label: string
	children: ReactNode
}

export function PropertyRow({ label, children }: PropertyRowProps) {
	return (
		<div className="flex min-h-7 items-start gap-3 py-1.25">
			<span className="w-23 shrink-0 pt-0.5 text-[12px] text-fg-dim">{label}</span>
			<div className="min-w-0 flex-1 text-[12.5px] leading-5 text-fg">{children}</div>
		</div>
	)
}

export const PROPERTY_ROW_TRIGGER =
	'inline-flex items-center gap-1.5 rounded-[7px] border border-transparent px-1.5 py-0.5 -mx-1.5 text-left transition-colors hover:bg-raised hover:border-border focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none data-[popup-open]:bg-raised data-[popup-open]:border-border'
