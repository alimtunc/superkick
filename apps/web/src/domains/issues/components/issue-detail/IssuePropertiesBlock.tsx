import { StatusIcon } from '@/components/primitives'
import { IssuePullRequestsBlock } from '@/domains/issues/components/issue-detail/IssuePullRequestsBlock'
import { AssigneeRow } from '@/domains/issues/components/issue-detail/properties/AssigneeRow'
import { DueDateRow } from '@/domains/issues/components/issue-detail/properties/DueDateRow'
import { EstimateRow } from '@/domains/issues/components/issue-detail/properties/EstimateRow'
import { LabelsRow } from '@/domains/issues/components/issue-detail/properties/LabelsRow'
import { PriorityRow } from '@/domains/issues/components/issue-detail/properties/PriorityRow'
import { ProjectRow } from '@/domains/issues/components/issue-detail/properties/ProjectRow'
import { PropertyGroup } from '@/domains/issues/components/issue-detail/properties/PropertyGroup'
import { PropertyRow } from '@/domains/issues/components/issue-detail/properties/PropertyRow'
import { StatusRow } from '@/domains/issues/components/issue-detail/properties/StatusRow'
import { statusIconKindFor } from '@/lib/domain'
import { pickLatestPr } from '@/lib/pr'
import type { IssueDetailResponse } from '@/types'

interface IssuePropertiesBlockProps {
	issue: IssueDetailResponse
}

export function IssuePropertiesBlock({ issue }: IssuePropertiesBlockProps) {
	const cycleLabel = issue.cycle?.name ?? null
	const pr = pickLatestPr(issue.linked_runs)

	return (
		<section aria-label="Issue properties">
			<PropertyGroup label="Status">
				<StatusRow issue={issue} />
				<IssuePullRequestsBlock issue={issue} runPr={pr} />
				<PriorityRow issue={issue} />
				<AssigneeRow issue={issue} />
			</PropertyGroup>
			<PropertyGroup label="Details">
				<LabelsRow issue={issue} />
				<ProjectRow issue={issue} />
				<PropertyRow label="Cycle">
					{cycleLabel ? <span>{cycleLabel}</span> : <span className="prop__empty">No cycle</span>}
				</PropertyRow>
				<EstimateRow issue={issue} />
				<DueDateRow issue={issue} />
			</PropertyGroup>
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
