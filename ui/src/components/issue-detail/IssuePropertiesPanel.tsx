import { AuthorAvatar } from '@/components/issue-detail/AuthorAvatar'
import { IssuePropertyRow } from '@/components/issue-detail/IssuePropertyRow'
import { LabelChip } from '@/components/issue-detail/LabelChip'
import { StatusChip } from '@/components/issue-detail/StatusChip'
import { priorityColor } from '@/lib/domain/priorityMeta'
import type { IssueDetailResponse } from '@/types'

export function IssuePropertiesPanel({ issue }: { issue: IssueDetailResponse }) {
	const cycleLabel = issue.cycle ? (issue.cycle.name ?? `#${issue.cycle.number}`) : null

	return (
		<aside className="rounded-md border border-edge bg-graphite p-3">
			<dl className="divide-y divide-edge/60">
				<IssuePropertyRow label="Status">
					<StatusChip status={issue.status} />
				</IssuePropertyRow>
				<IssuePropertyRow label="Priority">
					<span className="inline-flex items-center gap-1.5">
						<span
							className="inline-block h-1.5 w-1.5 rounded-full"
							style={{ backgroundColor: priorityColor(issue.priority.value) }}
						/>
						{issue.priority.label}
					</span>
				</IssuePropertyRow>
				{issue.assignee ? (
					<IssuePropertyRow label="Assignee">
						<span className="inline-flex items-center justify-end gap-2">
							<span className="truncate">{issue.assignee.name}</span>
							<AuthorAvatar name={issue.assignee.name} avatarUrl={issue.assignee.avatar_url} />
						</span>
					</IssuePropertyRow>
				) : null}
				{issue.project ? (
					<IssuePropertyRow label="Project">{issue.project.name}</IssuePropertyRow>
				) : null}
				{cycleLabel ? <IssuePropertyRow label="Cycle">{cycleLabel}</IssuePropertyRow> : null}
				{issue.estimate != null ? (
					<IssuePropertyRow label="Estimate">{issue.estimate} pts</IssuePropertyRow>
				) : null}
				{issue.labels.length > 0 ? (
					<IssuePropertyRow label="Labels">
						<span className="flex flex-wrap justify-end gap-1">
							{issue.labels.map((label) => (
								<LabelChip key={label.name} label={label} />
							))}
						</span>
					</IssuePropertyRow>
				) : null}
			</dl>
		</aside>
	)
}
