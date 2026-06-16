import type { ComponentProps } from 'react'
import { PanelGroup, PanelResizeHandle } from 'react-resizable-panels'

import { cn } from '@/lib/utils'
import { GripVertical } from 'lucide-react'

export { Panel as ResizablePanel } from 'react-resizable-panels'
export type { ImperativePanelHandle } from 'react-resizable-panels'

export function ResizablePanelGroup({ className, ...props }: ComponentProps<typeof PanelGroup>) {
	return (
		<PanelGroup
			className={cn(
				'flex h-full min-h-0 w-full data-[panel-group-direction=vertical]:flex-col',
				className
			)}
			{...props}
		/>
	)
}

interface ResizableHandleProps extends ComponentProps<typeof PanelResizeHandle> {
	withHandle?: boolean
}

export function ResizableHandle({ withHandle, className, ...props }: ResizableHandleProps) {
	return (
		<PanelResizeHandle
			className={cn(
				'relative flex w-px items-center justify-center bg-border transition-colors hover:bg-border-strong focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none data-[resize-handle-state=drag]:bg-accent',
				className
			)}
			{...props}
		>
			{withHandle ? (
				<div className="z-10 flex h-5 w-3 items-center justify-center rounded-xs border border-border bg-surface">
					<GripVertical size={10} className="text-fg-dim" aria-hidden="true" />
				</div>
			) : null}
		</PanelResizeHandle>
	)
}
