import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { Combobox } from '@base-ui/react/combobox'

export const COMBOBOX_POPUP_CLASS = 'flex flex-col rounded-[7px] border border-border bg-surface shadow-lg'

interface ComboboxPopupProps {
	children: ReactNode
	popupClassName?: string
	positionerClassName?: string
	sideOffset?: number
	align?: 'start' | 'center' | 'end'
	side?: 'top' | 'right' | 'bottom' | 'left'
	collisionPadding?: number
}

export function ComboboxPopup({
	children,
	popupClassName,
	positionerClassName = 'z-popover-over-dialog',
	sideOffset = 6,
	align = 'start',
	side,
	collisionPadding = 8
}: ComboboxPopupProps) {
	return (
		<Combobox.Portal>
			<Combobox.Positioner
				sideOffset={sideOffset}
				align={align}
				side={side}
				collisionPadding={collisionPadding}
				collisionAvoidance={{ side: 'flip', align: 'shift' }}
				className={positionerClassName}
			>
				<Combobox.Popup className={cn(COMBOBOX_POPUP_CLASS, popupClassName)}>
					{children}
				</Combobox.Popup>
			</Combobox.Positioner>
		</Combobox.Portal>
	)
}
