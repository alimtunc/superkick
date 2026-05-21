import { patchIssueState } from '@/api'
import { launchQueueItemIdentifier } from '@/lib/domain'
import { queryKeys } from '@/lib/queryKeys'
import type {
	IssueStateMutable,
	IssueStatus,
	LaunchQueue,
	LaunchQueueItem,
	LaunchQueueResponse,
	LinearStateType
} from '@/types'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

interface UpdateIssueStateVariables {
	issueId: string
	issueIdentifier: string
	teamId: string | null
	to: IssueStateMutable
}

const TARGET_BUCKET: Record<IssueStateMutable, LaunchQueue> = {
	open: 'todo',
	in_progress: 'active',
	done: 'done'
}

const TARGET_LINEAR_STATE: Record<IssueStateMutable, LinearStateType> = {
	open: 'unstarted',
	in_progress: 'started',
	done: 'completed'
}

/** Persist a kanban drag to Linear with optimistic update + rollback on the launch-queue cache. */
export function useUpdateIssueState() {
	const queryClient = useQueryClient()

	return useMutation<void, Error, UpdateIssueStateVariables, { previous?: LaunchQueueResponse }>({
		mutationFn: ({ issueId, teamId, to }) => patchIssueState(issueId, to, teamId),
		onMutate: async ({ issueIdentifier, to }) => {
			await queryClient.cancelQueries({ queryKey: queryKeys.launchQueue.all })
			const previous = queryClient.getQueryData<LaunchQueueResponse>(queryKeys.launchQueue.all)
			if (previous) {
				queryClient.setQueryData<LaunchQueueResponse>(
					queryKeys.launchQueue.all,
					rewriteSnapshot(previous, issueIdentifier, to)
				)
			}
			return { previous }
		},
		onError: (err, _vars, context) => {
			if (context?.previous) {
				queryClient.setQueryData(queryKeys.launchQueue.all, context.previous)
			}
			toast.error('Status update failed', { description: err.message })
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.launchQueue.all })
			queryClient.invalidateQueries({ queryKey: queryKeys.issues.all })
			queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.queue })
		}
	})
}

function rewriteSnapshot(
	snapshot: LaunchQueueResponse,
	issueIdentifier: string,
	to: IssueStateMutable
): LaunchQueueResponse {
	const targetBucket = TARGET_BUCKET[to]
	const groups: Record<LaunchQueue, LaunchQueueItem[]> = {} as Record<LaunchQueue, LaunchQueueItem[]>
	const targetStatus = peerStatusInBucket(snapshot, targetBucket)
	let moved: LaunchQueueItem | undefined

	for (const [bucket, items] of Object.entries(snapshot.groups) as [LaunchQueue, LaunchQueueItem[]][]) {
		const kept: LaunchQueueItem[] = []
		for (const item of items) {
			if (!moved && launchQueueItemIdentifier(item) === issueIdentifier) {
				moved = rewriteItem(item, to, targetBucket, targetStatus)
				continue
			}
			kept.push(item)
		}
		groups[bucket] = kept
	}

	if (moved) {
		groups[targetBucket] = [moved, ...(groups[targetBucket] ?? [])]
	}

	return { ...snapshot, groups }
}

function peerStatusInBucket(snapshot: LaunchQueueResponse, bucket: LaunchQueue): IssueStatus | undefined {
	for (const item of snapshot.groups[bucket] ?? []) {
		if (item.kind === 'issue') return item.issue.status
	}
	return undefined
}

function rewriteItem(
	item: LaunchQueueItem,
	to: IssueStateMutable,
	bucket: LaunchQueue,
	targetStatus: IssueStatus | undefined
): LaunchQueueItem {
	if (item.kind === 'issue') {
		return {
			...item,
			bucket,
			issue: {
				...item.issue,
				status: targetStatus ?? { ...item.issue.status, state_type: TARGET_LINEAR_STATE[to] }
			}
		}
	}
	return { ...item, bucket }
}
