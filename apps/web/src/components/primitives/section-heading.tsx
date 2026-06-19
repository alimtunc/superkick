import type { ReactNode } from 'react'

interface SectionHeadingProps {
	children: ReactNode
}

export function SectionHeading({ children }: SectionHeadingProps) {
	return (
		<h3 className="font-data mb-1.5 text-[10px] tracking-[0.08em] text-fg-dim uppercase">{children}</h3>
	)
}
