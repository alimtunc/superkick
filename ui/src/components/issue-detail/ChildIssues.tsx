import { IssueRow } from '@/components/issues/IssueRow'
import type { IssueChildRef, IssueWithState, LinearIssueListItem } from '@/types'
import { Icon } from '@/ui'

function childRefToWrapper(child: IssueChildRef): IssueWithState {
	const issue: LinearIssueListItem = {
		id: child.id,
		identifier: child.identifier,
		title: child.title,
		status: child.status,
		team_id: null,
		priority: child.priority ?? { value: 0, label: 'None' },
		labels: child.labels ?? [],
		assignee: child.assignee ?? null,
		project: null,
		parent: null,
		children: [],
		blocked_by: [],
		url: '',
		created_at: child.updated_at ?? '',
		updated_at: child.updated_at ?? ''
	}
	return { issue, state: 'open', bucket: undefined, linkedRun: undefined }
}

export function ChildIssues({ issues }: { issues: IssueChildRef[] }) {
	if (issues.length === 0) return null
	const completed = issues.filter((issue) => issue.status.state_type === 'completed').length
	const completionPercent = Math.round((completed / issues.length) * 100)

	return (
		<div className="overflow-hidden rounded-md border border-border bg-canvas">
			<header className="flex h-9 items-center gap-2 border-b border-border bg-surface px-3">
				<Icon name="chevDown" size={12} className="text-fg-dim" />
				<h3 className="text-[13px] font-semibold text-fg">Sub-issues</h3>
				<span className="font-data text-[11px] text-fg-dim">
					{completed} / {issues.length}
				</span>
				<div
					className="ml-auto h-1 w-20 overflow-hidden rounded-full bg-raised"
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
					<IssueRow key={child.id} wrapper={childRefToWrapper(child)} bucket="open" />
				))}
			</div>
		</div>
	)
}
