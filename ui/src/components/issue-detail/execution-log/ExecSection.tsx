import { useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface ExecSectionProps {
	id: string
	label: string
	count?: number
	action?: ReactNode
	defaultOpen?: boolean
	collapsible?: boolean
	children: ReactNode
}

export function ExecSection({
	id,
	label,
	count,
	action,
	defaultOpen = true,
	collapsible = true,
	children
}: ExecSectionProps) {
	const [open, setOpen] = useState(defaultOpen)
	const headerId = `${id}-header`
	const panelId = `${id}-panel`
	const showCount = typeof count === 'number'

	return (
		<section aria-labelledby={headerId} className="rounded-md border border-border bg-surface">
			<header className="flex items-center gap-2 px-3 py-2">
				{collapsible ? (
					<button
						id={headerId}
						type="button"
						onClick={() => setOpen((v) => !v)}
						aria-expanded={open}
						aria-controls={panelId}
						className="font-data inline-flex items-center gap-1.5 text-[10.5px] font-medium tracking-[0.16em] text-fg-dim uppercase transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
					>
						{open ? (
							<ChevronDown size={11} strokeWidth={2} aria-hidden="true" />
						) : (
							<ChevronRight size={11} strokeWidth={2} aria-hidden="true" />
						)}
						{label}
					</button>
				) : (
					<span
						id={headerId}
						className="font-data text-[10.5px] font-medium tracking-[0.16em] text-fg-dim uppercase"
					>
						{label}
					</span>
				)}
				{showCount ? <span className="font-data text-[11px] text-fg-dim">{count}</span> : null}
				{action ? <span className="ml-auto inline-flex items-center">{action}</span> : null}
			</header>
			<div id={panelId} className={cn('px-3 pt-1 pb-3', open ? '' : 'hidden')}>
				{children}
			</div>
		</section>
	)
}
