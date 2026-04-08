import type { ReactElement } from 'react'

import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip'

export function Tooltip({ label, children }: { label: string | null | undefined; children: ReactElement }) {
	if (!label) return children

	return (
		<TooltipPrimitive.Root>
			<TooltipPrimitive.Trigger render={children} />
			<TooltipPrimitive.Portal>
				<TooltipPrimitive.Positioner sideOffset={6} className="z-50">
					<TooltipPrimitive.Popup className="font-data rounded-md bg-ash px-2 py-1 text-[10px] text-silver shadow-md">
						{label}
					</TooltipPrimitive.Popup>
				</TooltipPrimitive.Positioner>
			</TooltipPrimitive.Portal>
		</TooltipPrimitive.Root>
	)
}
