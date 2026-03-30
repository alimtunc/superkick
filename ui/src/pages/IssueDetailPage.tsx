import { IssueDetail } from '@/components/issue-detail/IssueDetail'
import { useParams } from '@tanstack/react-router'

export function IssueDetailPage() {
	const { issueId } = useParams({ from: '/issues/$issueId' })
	return <IssueDetail issueId={issueId} />
}
