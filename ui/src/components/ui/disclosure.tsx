import { useState, type ReactNode } from 'react'

interface DisclosureProps {
	header: (open: boolean) => ReactNode
	defaultOpen?: boolean
	children: ReactNode
}

export function Disclosure({ header, defaultOpen = false, children }: DisclosureProps) {
	const [open, setOpen] = useState(defaultOpen)
	return (
		<div className="font-data bg-carbon-dim rounded-md border border-edge text-[11px] text-fog">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-carbon"
				aria-expanded={open}
			>
				<span
					aria-hidden="true"
					className={`inline-block text-dim transition-transform ${open ? 'rotate-90' : ''}`}
				>
					›
				</span>
				{header(open)}
			</button>
			{open ? <div className="border-t border-edge px-2 py-2">{children}</div> : null}
		</div>
	)
}
