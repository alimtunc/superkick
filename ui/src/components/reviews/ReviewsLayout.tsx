import type { ReactNode } from 'react'

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'

import { ReviewsInbox } from './ReviewsInbox'

interface ReviewsLayoutProps {
	children: ReactNode
}

export function ReviewsLayout({ children }: ReviewsLayoutProps) {
	return (
		<ResizablePanelGroup direction="horizontal" autoSaveId="reviews-list" className="h-full min-h-0">
			<ResizablePanel order={1} defaultSize={24} minSize={16} maxSize={42} className="min-h-0 min-w-0">
				<aside aria-label="Reviews list" className="h-full min-h-0 min-w-0">
					<ReviewsInbox />
				</aside>
			</ResizablePanel>
			<ResizableHandle withHandle />
			<ResizablePanel order={2} minSize={40} className="min-h-0 min-w-0">
				{children}
			</ResizablePanel>
		</ResizablePanelGroup>
	)
}
