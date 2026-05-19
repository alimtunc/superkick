import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { Popover } from '@base-ui/react/popover'

interface PopoverPopupProps {
	children: ReactNode
	className?: string
	popupClassName?: string
	sideOffset?: number
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
	align = 'start',
	side,
	initialFocus,
	collisionPadding = 8
}: PopoverPopupProps) {
	return (
		<Popover.Portal>
			<Popover.Positioner
				sideOffset={sideOffset}
				align={align}
				side={side}
				collisionPadding={collisionPadding}
				collisionAvoidance={{ side: 'flip', align: 'shift' }}
				className={cn('z-popover', className)}
			>
				<Popover.Popup
					initialFocus={initialFocus}
					className={cn(
						'overflow-hidden rounded-[7px] border border-border bg-surface shadow-lg outline-none',
						popupClassName
					)}
				>
					{children}
				</Popover.Popup>
			</Popover.Positioner>
		</Popover.Portal>
	)
}
