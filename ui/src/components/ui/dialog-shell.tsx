import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { Icon } from '@/ui/Icon'
import { Dialog } from '@base-ui/react/dialog'

interface DialogPopupProps {
	children: ReactNode
	align?: 'center' | 'top'
	popupClassName?: string
	backdropClassName?: string
	initialFocus?: React.ComponentProps<typeof Dialog.Popup>['initialFocus']
}

export function DialogPopup({
	children,
	align = 'center',
	popupClassName,
	backdropClassName,
	initialFocus
}: DialogPopupProps) {
	return (
		<Dialog.Portal>
			<Dialog.Backdrop
				className={cn(
					'fixed inset-0 z-overlay bg-black/60 backdrop-blur-sm transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0',
					backdropClassName
				)}
			/>
			<Dialog.Popup
				initialFocus={initialFocus}
				className={cn(
					'fixed left-1/2 z-dialog -translate-x-1/2 transition-transform duration-200 outline-none data-[ending-style]:scale-98 data-[starting-style]:scale-98',
					align === 'center' ? 'top-1/2 -translate-y-1/2' : 'top-[12vh]',
					popupClassName
				)}
			>
				{children}
			</Dialog.Popup>
		</Dialog.Portal>
	)
}

interface DialogShellProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	title: ReactNode
	icon?: ReactNode
	footer?: ReactNode
	align?: 'center' | 'top'
	popupClassName?: string
	initialFocus?: DialogPopupProps['initialFocus']
	children: ReactNode
}

export function DialogShell({
	open,
	onOpenChange,
	title,
	icon,
	footer,
	align,
	popupClassName = 'dialog',
	initialFocus,
	children
}: DialogShellProps) {
	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<DialogPopup align={align} popupClassName={popupClassName} initialFocus={initialFocus}>
				<div className="dialog__head">
					{icon}
					<Dialog.Title className="dialog__title">{title}</Dialog.Title>
					<span className="spacer" />
					<Dialog.Close className="iconbtn" aria-label="Close">
						<Icon name="x" size={16} className="ic" />
					</Dialog.Close>
				</div>
				{children}
				{footer ? <div className="dialog__foot">{footer}</div> : null}
			</DialogPopup>
		</Dialog.Root>
	)
}
