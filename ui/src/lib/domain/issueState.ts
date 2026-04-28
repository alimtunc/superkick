import type { IssueState, LaunchQueue, LaunchQueueItem, LinearIssueListItem, LinearStateType } from '@/types'

/**
 * The launch-queue classifier (server) emits 9 buckets; the operator-facing
 * surface reduces to 6 states. `waiting` and `blocked` fold into `todo`
 * because the question on those rows is "is this ready to start?" not
 * "what column is it in?" — the badges downstream of this map carry the
 * gating reason. `launchable` → `todo` (it lives in the upstream lane until
 * dispatched). `in-pr` → `in_review` so the vocabulary stays product-facing.
 */
const LAUNCH_QUEUE_TO_ISSUE_STATE: Record<LaunchQueue, IssueState> = {
	backlog: 'backlog',
	todo: 'todo',
	launchable: 'todo',
	waiting: 'todo',
	blocked: 'todo',
	active: 'in_progress',
	'needs-human': 'needs_human',
	'in-pr': 'in_review',
	done: 'done'
}

export function mapLaunchQueueToIssueState(bucket: LaunchQueue): IssueState {
	return LAUNCH_QUEUE_TO_ISSUE_STATE[bucket]
}

/** Canonical left-to-right kanban order. Six entries, exactly. */
export const ISSUE_STATE_ORDER: readonly IssueState[] = [
	'backlog',
	'todo',
	'in_progress',
	'needs_human',
	'in_review',
	'done'
] as const

const LINEAR_STATE_TO_ISSUE_STATE: Record<LinearStateType, IssueState> = {
	backlog: 'backlog',
	unstarted: 'todo',
	started: 'in_progress',
	completed: 'done',
	canceled: 'done'
}

/**
 * Fallback path for issues that do not appear in the launch queue snapshot
 * (Linear-cold issues that the server-side classifier hasn't seen, or
 * cross-team items past the 200-row cap). Collapses `canceled` into `done`
 * to avoid a "dismissed" column the model intentionally drops.
 */
export function issueStateFromLinear(stateType: LinearStateType): IssueState {
	return LINEAR_STATE_TO_ISSUE_STATE[stateType]
}

/**
 * Group launch-queue items by their issue state. Returns a record keyed by
 * every state — empty arrays for empty columns so the kanban can map over
 * `ISSUE_STATE_ORDER` without conditional rendering.
 */
export function groupItemsByIssueState(
	items: readonly LaunchQueueItem[]
): Record<IssueState, LaunchQueueItem[]> {
	const groups: Record<IssueState, LaunchQueueItem[]> = {
		backlog: [],
		todo: [],
		in_progress: [],
		needs_human: [],
		in_review: [],
		done: []
	}
	for (const item of items) {
		groups[mapLaunchQueueToIssueState(item.bucket)].push(item)
	}
	return groups
}

/**
 * Narrow a Linear issue to its operator state by preferring the launch-queue
 * verdict (server-side, captures runs and blockers) and falling back to the
 * raw Linear state when the issue is not present in the snapshot.
 */
export function issueStateFor(
	issue: LinearIssueListItem,
	bucketByIdentifier: Map<string, LaunchQueue>
): IssueState {
	const bucket = bucketByIdentifier.get(issue.identifier)
	if (bucket !== undefined) return mapLaunchQueueToIssueState(bucket)
	return issueStateFromLinear(issue.status.state_type)
}
