import { issueWorkspaceContextQuery } from '@/lib/queries'
import { useQuery } from '@tanstack/react-query'

export function useIssueWorkspaceContext(issueId: string | null) {
	return useQuery(issueWorkspaceContextQuery(issueId))
}

export type IssueWorkspaceContextQuery = ReturnType<typeof useIssueWorkspaceContext>
