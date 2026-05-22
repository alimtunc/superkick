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
		<div className="flex flex-1 flex-col items-center justify-center gap-3.5 px-6 py-16 text-center">
			<span
				aria-hidden="true"
				className="flex size-14 items-center justify-center rounded-full bg-raised text-fg-muted"
			>
				<Icon size={22} strokeWidth={1.6} />
			</span>
			<p className="text-[15px] font-medium text-fg">{title}</p>
			{description ? (
				<p className="max-w-sm text-[13px] leading-relaxed text-fg-muted">{description}</p>
			) : null}
			{action ? <div className="mt-1 flex items-center gap-2">{action}</div> : null}
		</div>
	)
}
