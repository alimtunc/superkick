import { Pill } from '@/components/primitives'
import { AuthorAvatar } from '@/domains/issues/components/issue-detail/AuthorAvatar'
import type { PrReviewer } from '@/types'

import { reviewerStateView } from './reviewStatus'

interface ReviewerRowProps {
	reviewer: PrReviewer
}

export function ReviewerRow({ reviewer }: ReviewerRowProps) {
	const view = reviewerStateView(reviewer.state)
	return (
		<li className="flex items-center gap-2">
			<AuthorAvatar name={reviewer.login} avatarUrl={null} size={18} />
			<span className="min-w-0 flex-1 truncate text-[12px] text-fg">{reviewer.login}</span>
			<Pill tone={view.tone} size="xs">
				{view.label}
			</Pill>
		</li>
	)
}
