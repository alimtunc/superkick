import { Icon, StatusIcon } from '@/components/primitives'
import { ChildIssues } from '@/domains/issues/components/issue-detail/ChildIssues'
import { EditableDescription } from '@/domains/issues/components/issue-detail/properties/EditableDescription'
import { EditableTitle } from '@/domains/issues/components/issue-detail/properties/EditableTitle'
import { statusIconKindFor } from '@/lib/domain'
import type { IssueDetailResponse } from '@/types'

interface IssueIntroProps {
	issue: IssueDetailResponse
}

export function IssueIntro({ issue }: IssueIntroProps) {
	return (
		<>
			<div className="issue-head">
				<div className="issue-head__crumb">
					{issue.parent ? (
						<>
							<span className="mono">{issue.parent.identifier}</span>
							<Icon name="chev" size={12} className="ic" />
						</>
					) : null}
					<StatusIcon kind={statusIconKindFor(issue.status)} size={14} color={issue.status.color} />
					<span className="mono">{issue.identifier}</span>
					<span>·</span>
					<span>{issue.status.name}</span>
				</div>
				<EditableTitle issue={issue} />
			</div>
			<EditableDescription issue={issue} />
			{issue.children.length > 0 ? (
				<section aria-label="Sub-issues">
					<ChildIssues issues={issue.children} />
				</section>
			) : null}
		</>
	)
}
