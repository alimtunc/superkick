import { fetchReusableWorktree } from '@/api'
import type { ReusableWorktree } from '@/types'
import { useQuery } from '@tanstack/react-query'

// Empty identifier disables the query (no issue selected yet). `null` data means
// the issue has no finished worktree-backed run to continue.
export function useIssueReusableWorktree(issueIdentifier: string): ReusableWorktree | null {
	const query = useQuery({
		queryKey: ['issues', issueIdentifier, 'reusable-worktree'] as const,
		queryFn: () => fetchReusableWorktree(issueIdentifier),
		enabled: issueIdentifier.length > 0,
		staleTime: 5_000
	})
	return query.data ?? null
}
