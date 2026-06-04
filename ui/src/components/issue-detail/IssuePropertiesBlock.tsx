import { AssigneeRow } from '@/components/issue-detail/properties/AssigneeRow'
import { DueDateRow } from '@/components/issue-detail/properties/DueDateRow'
import { EstimateRow } from '@/components/issue-detail/properties/EstimateRow'
import { LabelsRow } from '@/components/issue-detail/properties/LabelsRow'
import { PriorityRow } from '@/components/issue-detail/properties/PriorityRow'
import { ProjectRow } from '@/components/issue-detail/properties/ProjectRow'
import { PropertyRow } from '@/components/issue-detail/properties/PropertyRow'
import { StatusRow } from '@/components/issue-detail/properties/StatusRow'
import { PrBadge } from '@/components/pr/PrBadge'
import { pickLatestPr } from '@/lib/pr'
import type { IssueDetailResponse } from '@/types'
import { StatusIcon, statusIconKindFor } from '@/ui'

interface IssuePropertiesBlockProps {
	issue: IssueDetailResponse
}

export function IssuePropertiesBlock({ issue }: IssuePropertiesBlockProps) {
	const cycleLabel = issue.cycle?.name ?? null
	const pr = pickLatestPr(issue.linked_runs)

	return (
		<section aria-label="Issue properties">
			<div className="rail__group">
				<StatusRow issue={issue} />
				{pr ? (
					<PropertyRow label="Pull request">
						<a
							href={pr.url}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center hover:opacity-80"
							title="Open pull request"
						>
							<PrBadge pr={pr} size="sm" />
						</a>
					</PropertyRow>
				) : null}
				<PriorityRow issue={issue} />
				<AssigneeRow issue={issue} />
			</div>
			<div className="rail__group">
				<LabelsRow issue={issue} />
				<ProjectRow issue={issue} />
				<PropertyRow label="Cycle">
					{cycleLabel ? <span>{cycleLabel}</span> : <span className="prop__empty">No cycle</span>}
				</PropertyRow>
				<EstimateRow issue={issue} />
				<DueDateRow issue={issue} />
			</div>
			{issue.blocked_by.length > 0 ? (
				<div className="rail__group">
					{issue.blocked_by.map((blocker) => (
						<div key={blocker.id} className="prop">
							<span className="prop__k">Blocked by</span>
							<span className="prop__v">
								<StatusIcon
									kind={statusIconKindFor(blocker.status)}
									size={14}
									color={blocker.status.color}
								/>
								<span className="mono" style={{ color: 'var(--fg-muted)' }}>
									{blocker.identifier}
								</span>
								<span
									className="truncate"
									style={{ color: 'var(--fg-dim)', fontSize: 'var(--text-12)' }}
								>
									{blocker.title}
								</span>
							</span>
						</div>
					))}
				</div>
			) : null}
		</section>
	)
}
