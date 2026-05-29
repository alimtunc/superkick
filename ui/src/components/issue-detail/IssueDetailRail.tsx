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
		<aside
			aria-label="Issue rail"
			className="flex h-full min-h-0 w-[308px] shrink-0 flex-col border-l border-border bg-surface"
		>
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3.5">
				<h2 className="px-2 pt-0.5 pb-1.5 text-[10.5px] font-semibold tracking-[0.8px] text-fg-dim uppercase">
					Properties
				</h2>
				<IssuePropertiesBlock issue={issue} />
				<div className="my-2 border-t border-border" />
				<div className="px-2 py-1 text-[11px] leading-[1.6] text-fg-dim">
					<div>Created {createdLabel}</div>
					<div>Updated {fmtRelativeTime(issue.updated_at)}</div>
				</div>
			</div>
		</aside>
	)
}
