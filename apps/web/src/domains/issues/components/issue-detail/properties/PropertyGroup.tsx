import type { ReactNode } from 'react'

interface PropertyGroupProps {
	label: string
	children: ReactNode
}

export function PropertyGroup({ label, children }: PropertyGroupProps) {
	return (
		<div className="rail__group">
			<div className="mb-1 text-[10.5px] font-semibold tracking-[0.06em] text-fg-dim uppercase">
				{label}
			</div>
			{children}
		</div>
	)
}
