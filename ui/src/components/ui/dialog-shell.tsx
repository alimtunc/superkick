import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
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
