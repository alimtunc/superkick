import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { Dialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'

type SideDrawerWidth = 'compact' | 'half' | 'two-thirds'

const WIDTH_CLASS: Record<SideDrawerWidth, string> = {
	compact: 'w-[560px] max-w-full',
	half: 'w-1/2 min-w-md',
	'two-thirds': 'w-2/3 min-w-xl'
}

interface SideDrawerProps {
	open: boolean
	onClose: () => void
	title: string
	closeAriaLabel: string
	width?: SideDrawerWidth
	/** Suppress the built-in header + use the tier-2 drawer chrome; the content owns its own header. */
	bare?: boolean
	children: ReactNode
}

export function SideDrawer({
	open,
	onClose,
	title,
	closeAriaLabel,
	width = 'half',
	bare = false,
	children
}: SideDrawerProps) {
	return (
		<Dialog.Root
			open={open}
			onOpenChange={(value) => {
				if (!value) onClose()
			}}
		>
			<Dialog.Portal>
				<Dialog.Backdrop className="fixed inset-0 z-overlay bg-(--bg-scrim) transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
				<Dialog.Popup
					className={cn(
						'fixed top-0 right-0 z-drawer flex h-dvh flex-col transition-transform duration-200 outline-none data-ending-style:translate-x-full data-starting-style:translate-x-full',
						bare
							? 'border-l border-border-strong bg-raised shadow-(--shadow-lg)'
							: 'border-l border-border bg-surface shadow-2xl',
						WIDTH_CLASS[width]
					)}
				>
					{bare ? null : (
						<header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
							<Dialog.Title className="font-data text-[11px] font-medium tracking-widest text-fg-muted uppercase">
								{title}
							</Dialog.Title>
							<Dialog.Close
								className="inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-dim transition-colors hover:bg-raised/40 hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:outline-none"
								aria-label={closeAriaLabel}
							>
								<X size={14} strokeWidth={1.75} aria-hidden="true" />
							</Dialog.Close>
						</header>
					)}
					{bare ? <Dialog.Title className="sr-only">{title}</Dialog.Title> : null}
					{children}
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	)
}
