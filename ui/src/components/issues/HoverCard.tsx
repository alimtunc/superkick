import type { ReactElement, ReactNode } from 'react'

import { Popover } from '@base-ui/react/popover'

const OPEN_DELAY = 400
const CLOSE_DELAY = 150

export function HoverCard({ content, children }: { content: ReactNode; children: ReactElement }) {
	return (
		<Popover.Root>
			<Popover.Trigger
				render={children}
				nativeButton={false}
				openOnHover
				delay={OPEN_DELAY}
				closeDelay={CLOSE_DELAY}
			/>
			<Popover.Portal>
				<Popover.Positioner sideOffset={4} align="end" className="z-50">
					<Popover.Popup initialFocus={false} className="pointer-events-none outline-none">
						{content}
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	)
}
