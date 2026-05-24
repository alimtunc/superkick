import { ExecutionStatusCard } from '@/components/issue-detail/ExecutionStatusCard'
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
			<header className="flex h-10 shrink-0 items-center border-b border-border px-4">
				<h2 className="font-data text-[11px] font-medium tracking-[0.18em] text-fg-dim uppercase">
					Properties
				</h2>
			</header>
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
				<IssuePropertiesBlock issue={issue} />
				<div className="mt-5">
					<ExecutionStatusCard issue={issue} />
				</div>
				<div className="mt-4 border-t border-border pt-4 text-[11.5px] leading-5 text-fg-dim">
					<div>Created {fmtRelativeTime(issue.created_at)}</div>
					<div>Updated {fmtRelativeTime(issue.updated_at)}</div>
				</div>
			</div>
		</aside>
	)
}
