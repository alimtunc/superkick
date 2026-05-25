import { useMemo } from 'react'

import { issueStateFor } from '@/lib/domain/issueState'
import type { IssueWithState, LaunchQueue, LaunchQueueItem } from '@/types'

import { useIssuesQuery } from './useIssuesQuery'
import { useLaunchQueue } from './useLaunchQueue'

export function useIssues(limit = 200) {
	const issuesQuery = useIssuesQuery(limit)
	const queue = useLaunchQueue()

	const queueItems: LaunchQueueItem[] = useMemo(() => {
		const flat: LaunchQueueItem[] = []
		for (const items of Object.values(queue.groups)) {
			flat.push(...items)
		}
		return flat
	}, [queue.groups])

	// Live run takes precedence — its bucket reflects the run state, which
	// is what the issue-state reduction wants for the linked issue.
	const { bucketByIdentifier, reasonByIdentifier, runByIdentifier } = useMemo(() => {
		const buckets = new Map<string, LaunchQueue>()
		const reasons = new Map<string, string>()
		const runs = new Map<string, Extract<LaunchQueueItem, { kind: 'run' }>>()
		for (const item of queueItems) {
			if (item.kind === 'issue') {
				buckets.set(item.issue.identifier, item.bucket)
				reasons.set(item.issue.identifier, item.reason)
				continue
			}
			if (item.linked_issue) {
				buckets.set(item.linked_issue.identifier, item.bucket)
				reasons.set(item.linked_issue.identifier, item.reason)
				runs.set(item.linked_issue.identifier, item)
			}
		}
		return { bucketByIdentifier: buckets, reasonByIdentifier: reasons, runByIdentifier: runs }
	}, [queueItems])

	const issues: IssueWithState[] = useMemo(
		() =>
			issuesQuery.allIssues.map((issue) => ({
				issue,
				state: issueStateFor(issue, bucketByIdentifier),
				bucket: bucketByIdentifier.get(issue.identifier),
				reason: reasonByIdentifier.get(issue.identifier),
				linkedRun: runByIdentifier.get(issue.identifier)
			})),
		[issuesQuery.allIssues, bucketByIdentifier, reasonByIdentifier, runByIdentifier]
	)

	return {
		issues,
		queueItems,
		queueGroups: queue.groups,
		recentUnblocks: queue.recentUnblocks,
		activeCapacity: queue.activeCapacity,
		generatedAt: queue.generatedAt,
		totalCount: issuesQuery.totalCount,
		loading: issuesQuery.loading || queue.loading,
		error: issuesQuery.error ?? queue.error,
		lastRefresh: issuesQuery.lastRefresh,
		refresh: issuesQuery.refresh,
		allIssues: issuesQuery.allIssues
	}
}

export type IssuesData = ReturnType<typeof useIssues>
