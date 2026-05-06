import type { ReactNode } from 'react'

interface EvidenceSectionProps {
	title: string
	count?: number
	defaultOpen?: boolean
	accent?: 'gold'
	children: ReactNode
}

export function EvidenceSection({
	title,
	count,
	defaultOpen = false,
	accent,
	children
}: EvidenceSectionProps) {
	const titleColor = accent === 'gold' ? 'text-gold' : 'text-silver'
	return (
		<details
			className="group rounded-md border border-edge bg-graphite/40 open:bg-graphite"
			open={defaultOpen}
		>
			<summary className="font-data flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[11px] font-medium tracking-widest uppercase select-none">
				<span
					aria-hidden="true"
					className="inline-block text-dim transition-transform group-open:rotate-90"
				>
					›
				</span>
				<span className={titleColor}>{title}</span>
				{count !== undefined ? <span className="text-dim">{count}</span> : null}
			</summary>
			<div className="border-t border-edge/60 px-3 py-3">{children}</div>
		</details>
	)
}
