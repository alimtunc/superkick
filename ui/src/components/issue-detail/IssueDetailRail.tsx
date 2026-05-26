import { IssuePropertiesBlock } from '@/components/issue-detail/IssuePropertiesBlock'
import { fmtRelativeTime } from '@/lib/domain'
import type { IssueDetailResponse } from '@/types'

interface IssueDetailRailProps {
	issue: IssueDetailResponse
}

export function IssueDetailRail({ issue }: IssueDetailRailProps) {
	return (
		<aside
			aria-label="Issue rail"
			className="flex h-full min-h-0 w-[320px] shrink-0 flex-col border-l border-border bg-canvas"
		>
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-4 pb-5">
				<h2 className="font-data mb-1 text-[10.5px] font-medium tracking-[0.16em] text-fg-dim uppercase">
					Properties
				</h2>
				<IssuePropertiesBlock issue={issue} />
				<div className="mt-5 border-t border-border pt-3 text-[11.5px] leading-5 text-fg-dim">
					<div>Created {fmtRelativeTime(issue.created_at)}</div>
					<div>Updated {fmtRelativeTime(issue.updated_at)}</div>
				</div>
			</div>
		</aside>
	)
}
