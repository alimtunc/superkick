import { AssigneeRow } from '@/components/issue-detail/properties/AssigneeRow'
import { DueDateRow } from '@/components/issue-detail/properties/DueDateRow'
import { EstimateRow } from '@/components/issue-detail/properties/EstimateRow'
import { LabelsRow } from '@/components/issue-detail/properties/LabelsRow'
import { PriorityRow } from '@/components/issue-detail/properties/PriorityRow'
import { ProjectRow } from '@/components/issue-detail/properties/ProjectRow'
import { PropertyRow } from '@/components/issue-detail/properties/PropertyRow'
import { StatusRow } from '@/components/issue-detail/properties/StatusRow'
import type { IssueDetailResponse } from '@/types'

interface IssuePropertiesBlockProps {
	issue: IssueDetailResponse
}

export function IssuePropertiesBlock({ issue }: IssuePropertiesBlockProps) {
	const cycleLabel = issue.cycle?.name ?? null

	return (
		<section aria-label="Issue properties" className="flex flex-col">
			<StatusRow issue={issue} />
			<PriorityRow issue={issue} />
			<AssigneeRow issue={issue} />
			<LabelsRow issue={issue} />
			<div className="my-2 border-t border-border" />
			<ProjectRow issue={issue} />
			<PropertyRow label="Cycle">
				<span className={cycleLabel ? 'text-fg' : 'text-fg-dim'}>{cycleLabel ?? 'No cycle'}</span>
			</PropertyRow>
			<EstimateRow issue={issue} />
			<DueDateRow issue={issue} />
			{issue.blocked_by.length > 0 ? (
				<>
					<div className="my-2 border-t border-border" />
					<PropertyRow label="Relations">
						<div className="flex flex-col gap-1">
							{issue.blocked_by.map((blocker) => (
								<span key={blocker.id} className="text-fg">
									Blocked by <span className="font-medium">{blocker.identifier}</span>
								</span>
							))}
						</div>
					</PropertyRow>
				</>
			) : null}
		</section>
	)
}
