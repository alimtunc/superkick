import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { Menu } from '@base-ui/react/menu'

interface MenuPopupProps {
	children: ReactNode
	className?: string
	popupClassName?: string
	sideOffset?: number
	align?: 'start' | 'center' | 'end'
	side?: 'top' | 'right' | 'bottom' | 'left'
	collisionPadding?: number
}

export function MenuPopup({
	children,
	className,
	popupClassName,
	sideOffset = 6,
	align = 'start',
	side,
	collisionPadding = 8
}: MenuPopupProps) {
	return (
		<Menu.Portal>
			<Menu.Positioner
				sideOffset={sideOffset}
				align={align}
				side={side}
				collisionPadding={collisionPadding}
				collisionAvoidance={{ side: 'flip', align: 'shift' }}
				className={cn('z-popover', className)}
			>
				<Menu.Popup
					className={cn(
						'overflow-hidden rounded-[7px] border border-border bg-surface shadow-lg outline-none',
						popupClassName
					)}
				>
					{children}
				</Menu.Popup>
			</Menu.Positioner>
		</Menu.Portal>
	)
}
