import { IssuePropertiesBlock } from '@/components/issue-detail/IssuePropertiesBlock'
import { fmtRelativeTime } from '@/lib/domain'
import { formatShortDate } from '@/lib/format'
import type { IssueDetailResponse } from '@/types'

interface IssueDetailRailProps {
	issue: IssueDetailResponse
}

export function IssueDetailRail({ issue }: IssueDetailRailProps) {
	const createdLabel = formatShortDate(issue.created_at)
	return (
		<aside aria-label="Issue rail" className="detail__rail">
			<IssuePropertiesBlock issue={issue} />
			<div className="rail__footer">
				<div>Created {createdLabel}</div>
				<div>Updated {fmtRelativeTime(issue.updated_at)}</div>
			</div>
		</aside>
	)
}
