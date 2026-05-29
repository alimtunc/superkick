import type { ReactNode } from 'react'

import type { LucideIcon } from 'lucide-react'

interface IssuesEmptyStateProps {
	icon: LucideIcon
	title: string
	description?: ReactNode
	action?: ReactNode
}

export function IssuesEmptyState({ icon: Icon, title, description, action }: IssuesEmptyStateProps) {
	return (
		<div className="empty-state h-full">
			<div className="empty-state__icon">
				<Icon size={20} strokeWidth={1.6} aria-hidden="true" />
			</div>
			<div className="empty-state__title">{title}</div>
			{description ? <div className="empty-state__sub">{description}</div> : null}
			{action ? <div className="mt-1 flex items-center gap-2">{action}</div> : null}
		</div>
	)
}
