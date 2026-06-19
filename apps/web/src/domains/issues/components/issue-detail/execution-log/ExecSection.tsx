import { type ReactNode, useId, useState } from 'react'

import { Icon } from '@/components/primitives'
interface ExecSectionProps {
	title: string
	count?: number | null
	defaultOpen?: boolean
	action?: ReactNode
	children: ReactNode
}

export function ExecSection({ title, count, defaultOpen = true, action, children }: ExecSectionProps) {
	const [open, setOpen] = useState(defaultOpen)
	const bodyId = useId()

	return (
		<section className="flex flex-col gap-2.5 border-t border-border px-4 py-3">
			<div className="flex items-center gap-1.5">
				<button
					type="button"
					onClick={() => setOpen((v) => !v)}
					aria-expanded={open}
					aria-controls={bodyId}
					className="inline-flex items-center gap-1.5 rounded text-fg-dim transition-colors hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
				>
					<Icon name={open ? 'chevDown' : 'chev'} size={11} strokeWidth={2} />
					<span className="text-[10.5px] font-semibold tracking-[0.9px] uppercase">{title}</span>
					{typeof count === 'number' ? (
						<span className="font-data text-[11px] text-fg-dim">· {count}</span>
					) : null}
				</button>
				{action ? <div className="ml-auto flex items-center">{action}</div> : null}
			</div>
			{open ? <div id={bodyId}>{children}</div> : null}
		</section>
	)
}
