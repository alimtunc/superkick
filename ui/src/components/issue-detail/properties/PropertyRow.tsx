import type { ReactNode } from 'react'

interface PropertyRowProps {
	label: string
	children: ReactNode
}

export function PropertyRow({ label, children }: PropertyRowProps) {
	return (
		<div className="prop">
			<span className="prop__k">{label}</span>
			<span className="prop__v">{children}</span>
		</div>
	)
}

export const PROPERTY_ROW_TRIGGER =
	'inline-flex min-w-0 items-center gap-[var(--space-3)] text-left focus-visible:outline-none'
