import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useState } from 'react'

import { cn } from '@/lib/utils'
import { Dialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'

type SideDrawerWidth = 'compact' | 'half' | 'two-thirds'

const WIDTH_CLASS: Record<SideDrawerWidth, string> = {
	compact: 'w-[560px] max-w-full',
	half: 'w-1/2 min-w-md',
	'two-thirds': 'w-2/3 min-w-xl'
}

const MIN_WIDTH_PX = 480

function clampWidth(px: number): number {
	const max = Math.round(window.innerWidth * 0.92)
	return Math.min(Math.max(px, MIN_WIDTH_PX), max)
}

interface SideDrawerProps {
	open: boolean
	onClose: () => void
	title: string
	closeAriaLabel: string
	width?: SideDrawerWidth
	/** Add a left-edge drag handle to resize the drawer. Width starts from `width`
	 *  and switches to a dragged pixel width; persists for the session. */
	resizable?: boolean
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
	resizable = false,
	bare = false,
	children
}: SideDrawerProps) {
	const [dragWidth, setDragWidth] = useState<number | null>(null)
	const [resizing, setResizing] = useState(false)

	useEffect(() => {
		if (!resizing) return
		const onMove = (e: PointerEvent) => setDragWidth(clampWidth(window.innerWidth - e.clientX))
		const onUp = () => setResizing(false)
		window.addEventListener('pointermove', onMove)
		window.addEventListener('pointerup', onUp)
		return () => {
			window.removeEventListener('pointermove', onMove)
			window.removeEventListener('pointerup', onUp)
		}
	}, [resizing])

	const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
		event.preventDefault()
		setResizing(true)
	}

	const useInlineWidth = resizable && dragWidth !== null

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
					style={useInlineWidth ? { width: dragWidth } : undefined}
					className={cn(
						'fixed top-0 right-0 z-drawer flex h-dvh flex-col transition-transform duration-200 outline-none data-ending-style:translate-x-full data-starting-style:translate-x-full',
						bare
							? 'border-l border-border-strong bg-raised shadow-(--shadow-lg)'
							: 'border-l border-border bg-surface shadow-2xl',
						resizable ? 'max-w-[92vw] min-w-md' : null,
						useInlineWidth ? null : WIDTH_CLASS[width]
					)}
				>
					{resizable ? (
						<div
							role="separator"
							aria-orientation="vertical"
							aria-label="Resize drawer"
							onPointerDown={startResize}
							className="absolute top-0 left-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-accent/40"
						/>
					) : null}
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
