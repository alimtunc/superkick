import { useMemo } from 'react'

import { issueStateFor } from '@/lib/domain/issueState'
import type { IssueState, LaunchQueue, LaunchQueueItem, LinearIssueListItem } from '@/types'

import { useIssuesQuery } from './useIssuesQuery'
import { useLaunchQueue } from './useLaunchQueue'

interface IssueWithState {
	issue: LinearIssueListItem
	state: IssueState
	bucket: LaunchQueue | undefined
	linkedRun: Extract<LaunchQueueItem, { kind: 'run' }> | undefined
}

/**
 * Unified issue feed (SUP-92).
 *
 * Two data planes are merged:
 * - The Linear issue list (`useIssuesQuery`) is the source of truth for the
 *   issue-first list view — it captures every Linear issue under the cap,
 *   including ones the launch-queue classifier hasn't seen yet.
 * - The launch queue (`useLaunchQueue`) provides the operator state via its
 *   bucket projection plus the linked-run summary used by the kanban and
 *   row-level run chip.
 *
 * The kanban consumes `queueItems` directly (orchestration-first); the list
 * consumes `issues` (every Linear issue with its operator-state verdict).
 */
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
	const { bucketByIdentifier, runByIdentifier } = useMemo(() => {
		const buckets = new Map<string, LaunchQueue>()
		const runs = new Map<string, Extract<LaunchQueueItem, { kind: 'run' }>>()
		for (const item of queueItems) {
			if (item.kind === 'issue') {
				buckets.set(item.issue.identifier, item.bucket)
				continue
			}
			if (item.linked_issue) {
				buckets.set(item.linked_issue.identifier, item.bucket)
				runs.set(item.linked_issue.identifier, item)
			}
		}
		return { bucketByIdentifier: buckets, runByIdentifier: runs }
	}, [queueItems])

	const issues: IssueWithState[] = useMemo(
		() =>
			issuesQuery.allIssues.map((issue) => ({
				issue,
				state: issueStateFor(issue, bucketByIdentifier),
				bucket: bucketByIdentifier.get(issue.identifier),
				linkedRun: runByIdentifier.get(issue.identifier)
			})),
		[issuesQuery.allIssues, bucketByIdentifier, runByIdentifier]
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
export type { IssueWithState }
