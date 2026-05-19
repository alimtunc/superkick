import type { ReactElement, ReactNode } from 'react'

import { PopoverPopup } from '@/components/ui/popover-shell'
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
			<PopoverPopup
				align="end"
				sideOffset={4}
				initialFocus={false}
				popupClassName="border-0 bg-transparent shadow-none"
			>
				{content}
			</PopoverPopup>
		</Popover.Root>
	)
}
