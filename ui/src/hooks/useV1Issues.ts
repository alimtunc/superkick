import { useMemo } from 'react'

import { v1StateForIssue } from '@/lib/domain/issuesV1State'
import type { LaunchQueue, LaunchQueueItem, LinearIssueListItem, V1IssueState } from '@/types'

import { useIssuesQuery } from './useIssuesQuery'
import { useLaunchQueue } from './useLaunchQueue'

interface IssueWithV1State {
	issue: LinearIssueListItem
	state: V1IssueState
	bucket: LaunchQueue | undefined
	linkedRun: Extract<LaunchQueueItem, { kind: 'run' }> | undefined
}

/**
 * Unified V1 issue feed (SUP-92).
 *
 * Two data planes are merged:
 * - The Linear issue list (`useIssuesQuery`) is the source of truth for the
 *   issue-first list view — it captures every Linear issue under the cap,
 *   including ones the launch-queue classifier hasn't seen yet.
 * - The launch queue (`useLaunchQueue`) provides the V1 state via its
 *   bucket projection plus the linked-run summary used by the kanban and
 *   row-level run chip.
 *
 * The kanban consumes `queueItems` directly (orchestration-first); the list
 * consumes `issues` (every Linear issue with its V1 verdict).
 */
export function useV1Issues(limit = 200) {
	const issuesQuery = useIssuesQuery(limit)
	const queue = useLaunchQueue()

	const queueItems: LaunchQueueItem[] = useMemo(() => {
		const flat: LaunchQueueItem[] = []
		for (const items of Object.values(queue.groups)) {
			flat.push(...items)
		}
		return flat
	}, [queue.groups])

	const bucketByIdentifier: Map<string, LaunchQueue> = useMemo(() => {
		const map = new Map<string, LaunchQueue>()
		for (const item of queueItems) {
			if (item.kind === 'issue') {
				map.set(item.issue.identifier, item.bucket)
			} else if (item.linked_issue) {
				// Live run takes precedence — its bucket reflects the run state,
				// which is what the V1 reduction wants for the linked issue.
				map.set(item.linked_issue.identifier, item.bucket)
			}
		}
		return map
	}, [queueItems])

	const runByIdentifier: Map<string, Extract<LaunchQueueItem, { kind: 'run' }>> = useMemo(() => {
		const map = new Map<string, Extract<LaunchQueueItem, { kind: 'run' }>>()
		for (const item of queueItems) {
			if (item.kind === 'run' && item.linked_issue) {
				map.set(item.linked_issue.identifier, item)
			}
		}
		return map
	}, [queueItems])

	const issues: IssueWithV1State[] = useMemo(
		() =>
			issuesQuery.allIssues.map((issue) => ({
				issue,
				state: v1StateForIssue(issue, bucketByIdentifier),
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

export type V1IssuesData = ReturnType<typeof useV1Issues>
export type V1IssueWithState = IssueWithV1State
