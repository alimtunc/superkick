import { ChildIssues } from '@/components/issue-detail/ChildIssues'
import { IssueDescription } from '@/components/issue-detail/IssueDescription'
import type { IssueDetailResponse } from '@/types'

interface IssueIntroProps {
	issue: IssueDetailResponse
}

export function IssueIntro({ issue }: IssueIntroProps) {
	const hasDescription = issue.description.trim().length > 0
	const hasChildren = issue.children.length > 0

	if (!hasDescription && !hasChildren) return null

	return (
		<>
			{hasDescription ? <IssueDescription description={issue.description} /> : null}
			{hasChildren ? (
				<section aria-label="Sub-issues">
					<ChildIssues issues={issue.children} />
				</section>
			) : null}
		</>
	)
}
