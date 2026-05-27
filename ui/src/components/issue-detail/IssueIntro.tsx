import { ChildIssues } from '@/components/issue-detail/ChildIssues'
import { IssueDescription } from '@/components/issue-detail/IssueDescription'
import { EditableTitle } from '@/components/issue-detail/properties/EditableTitle'
import type { IssueDetailResponse } from '@/types'

interface IssueIntroProps {
	issue: IssueDetailResponse
}

export function IssueIntro({ issue }: IssueIntroProps) {
	return (
		<>
			<EditableTitle issue={issue} />
			<IssueDescription issue={issue} />
			{issue.children.length > 0 ? (
				<section aria-label="Sub-issues">
					<ChildIssues issues={issue.children} />
				</section>
			) : null}
		</>
	)
}
