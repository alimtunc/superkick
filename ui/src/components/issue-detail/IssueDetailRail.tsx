import { ExecutionStatusCard } from '@/components/issue-detail/ExecutionStatusCard'
import { IssuePropertiesBlock } from '@/components/issue-detail/IssuePropertiesBlock'
import { IssueCommentExcerptsSection } from '@/components/issues/IssueCommentExcerptsSection'
import { IssueLinkedItemsSection } from '@/components/issues/IssueLinkedItemsSection'
import { IssueMemoryListSection } from '@/components/issues/IssueMemoryListSection'
import type { IssueDetailResponse } from '@/types'

interface IssueDetailRailProps {
	issue: IssueDetailResponse
}

export function IssueDetailRail({ issue }: IssueDetailRailProps) {
	return (
		<aside
			aria-label="Issue rail"
			className="bg-carbon-dim/40 flex h-full min-h-0 w-80 shrink-0 flex-col border-l border-edge"
		>
			<header className="flex h-9 shrink-0 items-center border-b border-edge px-4">
				<h2 className="font-data text-[11px] font-medium tracking-widest text-silver uppercase">
					Issue
				</h2>
			</header>
			<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
				<ExecutionStatusCard issue={issue} />
				<IssuePropertiesBlock issue={issue} />
				<IssueCommentExcerptsSection issueId={issue.identifier} omitWhenEmpty />
				<IssueLinkedItemsSection issueId={issue.identifier} omitWhenEmpty />
				<IssueMemoryListSection issueId={issue.identifier} omitWhenEmpty />
			</div>
		</aside>
	)
}
