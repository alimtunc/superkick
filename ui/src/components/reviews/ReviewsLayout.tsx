import type { ReactNode } from 'react'

import { ReviewsInbox } from './ReviewsInbox'

interface ReviewsLayoutProps {
	children: ReactNode
}

export function ReviewsLayout({ children }: ReviewsLayoutProps) {
	return (
		<div className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)]">
			<aside aria-label="Reviews list" className="min-h-0 min-w-0 border-r border-border">
				<ReviewsInbox />
			</aside>
			<div className="min-h-0 min-w-0">{children}</div>
		</div>
	)
}
