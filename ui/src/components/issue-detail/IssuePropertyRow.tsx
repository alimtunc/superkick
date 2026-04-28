import type { ReactNode } from 'react'

interface IssuePropertyRowProps {
	label: string
	children: ReactNode
}

export function IssuePropertyRow({ label, children }: IssuePropertyRowProps) {
	return (
		<div className="flex items-start justify-between gap-3 py-1.5">
			<dt className="font-data text-[10px] tracking-wider text-dim uppercase">{label}</dt>
			<dd className="font-data min-w-0 flex-1 text-right text-[11px] text-silver">{children}</dd>
		</div>
	)
}
