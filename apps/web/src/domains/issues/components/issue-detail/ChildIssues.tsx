import { Icon } from '@/components/primitives'
import { SubIssueRow } from '@/domains/issues/components/issue-detail/SubIssueRow'
import type { IssueChildRef } from '@/types'

export function ChildIssues({ issues }: { issues: IssueChildRef[] }) {
	if (issues.length === 0) return null
	const completed = issues.filter((issue) => issue.status.state_type === 'completed').length
	const completionPercent = Math.round((completed / issues.length) * 100)

	return (
		<div className="overflow-hidden rounded-[8px] border border-border bg-surface">
			<header className="flex items-center gap-2 border-b border-border px-3 py-2">
				<Icon name="chevDown" size={11} className="text-fg-dim" />
				<h3 className="text-[12.5px] font-semibold text-fg">Sub-issues</h3>
				<span className="font-data text-[11px] text-fg-dim">
					{completed} / {issues.length}
				</span>
				<div
					className="ml-auto h-1.25 w-20 overflow-hidden rounded-[3px] bg-border"
					aria-label={`Sub-issues ${completionPercent}% complete`}
				>
					<div className="h-full bg-success" style={{ width: `${completionPercent}%` }} />
				</div>
				<button
					type="button"
					className="inline-flex size-5 items-center justify-center rounded text-fg-dim hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
					aria-label="Add sub-issue"
				>
					<Icon name="plus" size={12} />
				</button>
			</header>
			<div>
				{issues.map((child) => (
					<SubIssueRow key={child.id} child={child} />
				))}
			</div>
		</div>
	)
}
