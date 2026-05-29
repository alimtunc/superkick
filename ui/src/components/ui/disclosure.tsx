import { useState, type ReactNode } from 'react'

interface DisclosureProps {
	header: (open: boolean) => ReactNode
	defaultOpen?: boolean
	children: ReactNode
}

export function Disclosure({ header, defaultOpen = false, children }: DisclosureProps) {
	const [open, setOpen] = useState(defaultOpen)
	return (
		<div className="font-data rounded-md border border-border bg-surface text-[11px] text-fg">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-surface"
				aria-expanded={open}
			>
				<span
					aria-hidden="true"
					className={`inline-block text-fg-dim transition-transform ${open ? 'rotate-90' : ''}`}
				>
					›
				</span>
				{header(open)}
			</button>
			{open ? <div className="border-t border-border px-2 py-2">{children}</div> : null}
		</div>
	)
}
