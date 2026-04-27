import type { ReactNode } from 'react'

interface InboxSectionProps {
	title: string
	count: number | null
	subtitle?: ReactNode
	tone?: 'default' | 'urgent'
	children: ReactNode
}

/**
 * Visual wrapper for an Inbox section. Provides the canonical heading row
 * (uppercase data label, count, optional subtitle slot) and a panel body —
 * each section delegates loading/empty/error to its own renderer slotted as
 * `children`.
 */
export function InboxSection({ title, count, subtitle, tone = 'default', children }: InboxSectionProps) {
	const titleClass =
		tone === 'urgent'
			? 'font-data text-[12px] tracking-[0.18em] text-oxide uppercase'
			: 'font-data text-[12px] tracking-[0.18em] text-fog uppercase'
	const dotClass = tone === 'urgent' ? 'bg-oxide' : 'bg-edge-bright'
	return (
		<section className="flex flex-col gap-3">
			<header className="flex items-center gap-3">
				<span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
				<h2 className={titleClass}>{title}</h2>
				{count != null ? <span className="font-data text-[10px] text-dim">{count}</span> : null}
				{subtitle ? <div className="ml-auto flex items-center">{subtitle}</div> : null}
			</header>
			{children}
		</section>
	)
}
