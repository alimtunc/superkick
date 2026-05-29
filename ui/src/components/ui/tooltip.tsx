import type { ReactElement } from 'react'

import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip'

interface TooltipProps {
	label: string | null | undefined
	children: ReactElement
	delay?: number
}

export function Tooltip({ label, children, delay = 300 }: TooltipProps) {
	if (!label) return children

	return (
		<TooltipPrimitive.Root>
			<TooltipPrimitive.Trigger delay={delay} render={children} />
			<TooltipPrimitive.Portal>
				<TooltipPrimitive.Positioner sideOffset={6} className="z-popover">
					<TooltipPrimitive.Popup className="font-data rounded-md bg-fg-dim px-2 py-1 text-[10px] text-fg-muted shadow-md">
						{label}
					</TooltipPrimitive.Popup>
				</TooltipPrimitive.Positioner>
			</TooltipPrimitive.Portal>
		</TooltipPrimitive.Root>
	)
}
