import { IssueCommentExcerptsSection } from '@/components/issues/IssueCommentExcerptsSection'
import { IssueLinkedItemsSection } from '@/components/issues/IssueLinkedItemsSection'
import { IssueMemoryListSection } from '@/components/issues/IssueMemoryListSection'
import { IssueSnapshotSection } from '@/components/issues/IssueSnapshotSection'

interface IssueContextSectionsProps {
	issueId: string
}

export function IssueContextSections({ issueId }: IssueContextSectionsProps) {
	return (
		<>
			<IssueSnapshotSection issueId={issueId} />
			<IssueCommentExcerptsSection issueId={issueId} />
			<IssueLinkedItemsSection issueId={issueId} />
			<IssueMemoryListSection issueId={issueId} />
		</>
	)
}
