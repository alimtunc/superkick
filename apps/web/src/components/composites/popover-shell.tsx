import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { Popover } from '@base-ui/react/popover'

export const POPOVER_POPUP_CLASS =
	'flex max-h-[min(420px,var(--available-height))] flex-col overflow-hidden rounded-[7px] border border-border bg-overlay shadow-lg outline-none transition-[opacity,transform] duration-150 ease-out data-[ending-style]:scale-98 data-[ending-style]:opacity-0 data-[starting-style]:scale-98 data-[starting-style]:opacity-0'

interface PopoverPopupProps {
	children: ReactNode
	className?: string
	popupClassName?: string
	sideOffset?: number
	alignOffset?: number
	align?: 'start' | 'center' | 'end'
	side?: 'top' | 'right' | 'bottom' | 'left'
	initialFocus?: boolean
	collisionPadding?: number
}

export function PopoverPopup({
	children,
	className,
	popupClassName,
	sideOffset = 6,
	alignOffset,
	align = 'start',
	side,
	initialFocus,
	collisionPadding = 8
}: PopoverPopupProps) {
	return (
		<Popover.Portal>
			<Popover.Positioner
				sideOffset={sideOffset}
				alignOffset={alignOffset}
				align={align}
				side={side}
				collisionPadding={collisionPadding}
				collisionAvoidance={{ side: 'flip', align: 'shift' }}
				className={cn('z-popover-over-dialog', className)}
			>
				<Popover.Popup
					initialFocus={initialFocus}
					className={cn(POPOVER_POPUP_CLASS, popupClassName)}
				>
					{children}
				</Popover.Popup>
			</Popover.Positioner>
		</Popover.Portal>
	)
}
