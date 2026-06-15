import type { ReactNode } from 'react'

interface ReviewRailGroupProps {
	label: string
	children: ReactNode
}

export function ReviewRailGroup({ label, children }: ReviewRailGroupProps) {
	return (
		<div className="rail__group">
			<div className="mb-2 text-[11px] font-medium tracking-wide text-fg-dim uppercase">{label}</div>
			{children}
		</div>
	)
}
