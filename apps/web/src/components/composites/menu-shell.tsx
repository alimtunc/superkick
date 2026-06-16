import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { Menu } from '@base-ui/react/menu'

export const MENU_ITEM_CLASS =
	'flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px] text-fg-muted outline-none transition-[background,color,transform] duration-100 ease-out data-highlighted:translate-x-0.5 data-highlighted:bg-(--bg-active) data-highlighted:text-fg data-disabled:cursor-not-allowed data-disabled:opacity-50'

export const MENU_POPUP_CLASS =
	'max-h-[min(360px,var(--available-height))] overflow-x-hidden overflow-y-auto rounded-[7px] border border-border bg-overlay p-1 shadow-lg outline-none transition-[opacity,transform] duration-150 ease-out data-[ending-style]:scale-98 data-[ending-style]:opacity-0 data-[starting-style]:scale-98 data-[starting-style]:opacity-0'

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
				className={cn('z-popover-over-dialog', className)}
			>
				<Menu.Popup className={cn(MENU_POPUP_CLASS, popupClassName)}>{children}</Menu.Popup>
			</Menu.Positioner>
		</Menu.Portal>
	)
}
