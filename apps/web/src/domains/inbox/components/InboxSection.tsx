import type { ReactNode } from 'react'

interface InboxSectionProps {
	title: string
	count: number | null
	subtitle?: ReactNode
	children: ReactNode
}

export function InboxSection({ title, count, subtitle, children }: InboxSectionProps) {
	return (
		<section className="flex flex-col">
			<header className="flex items-center gap-2 px-6 pt-3.5 pb-1.5 text-[11px] font-semibold tracking-wider text-fg-dim uppercase">
				<span>
					{title}
					{count != null ? ` · ${count}` : ''}
				</span>
				<span aria-hidden="true" className="ml-1.5 h-px flex-1 bg-border" />
				{subtitle ? <span className="shrink-0 normal-case">{subtitle}</span> : null}
			</header>
			{children}
		</section>
	)
}
