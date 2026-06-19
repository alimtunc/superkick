import { IssueCommentExcerptsSection } from '@/domains/issues/components/IssueCommentExcerptsSection'
import { IssueLinkedItemsSection } from '@/domains/issues/components/IssueLinkedItemsSection'
import { IssueMemoryListSection } from '@/domains/issues/components/IssueMemoryListSection'
import { IssueSnapshotSection } from '@/domains/issues/components/IssueSnapshotSection'

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
