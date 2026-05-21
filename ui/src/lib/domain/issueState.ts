import type {
	IssueState,
	IssueStateMutable,
	LaunchQueue,
	LaunchQueueItem,
	LinearIssueListItem,
	LinearStateType
} from '@/types'

/** 9 server buckets → 5 operator lanes. Backlog / waiting / blocked / launchable fold into `open` (gating reasons live on badges). */
const LAUNCH_QUEUE_TO_ISSUE_STATE: Record<LaunchQueue, IssueState> = {
	backlog: 'open',
	todo: 'open',
	launchable: 'open',
	waiting: 'open',
	blocked: 'open',
	active: 'in_progress',
	'needs-human': 'needs_human',
	'in-pr': 'in_review',
	done: 'done'
}

export function mapLaunchQueueToIssueState(bucket: LaunchQueue): IssueState {
	return LAUNCH_QUEUE_TO_ISSUE_STATE[bucket]
}

/** Canonical left-to-right kanban order. Five entries, exactly. */
export const ISSUE_STATE_ORDER: readonly IssueState[] = [
	'open',
	'in_progress',
	'needs_human',
	'in_review',
	'done'
] as const

/** States the kanban can persist. `needs_human` / `in_review` are runtime-derived — read-only drop targets. */
export const ISSUE_STATE_DROPPABLE: ReadonlySet<IssueState> = new Set<IssueState>([
	'open',
	'in_progress',
	'done'
])

export function isDroppableIssueState(state: IssueState): state is IssueStateMutable {
	return ISSUE_STATE_DROPPABLE.has(state)
}

const LINEAR_STATE_TO_ISSUE_STATE: Record<LinearStateType, IssueState> = {
	backlog: 'open',
	unstarted: 'open',
	started: 'in_progress',
	completed: 'done',
	canceled: 'done'
}

/** Fallback for issues outside the launch-queue snapshot. Collapses `canceled` into `done` — no dismissed column by design. */
export function issueStateFromLinear(stateType: LinearStateType): IssueState {
	return LINEAR_STATE_TO_ISSUE_STATE[stateType]
}

/** Group launch-queue items by issue state. Empty arrays for empty lanes so callers can map over `ISSUE_STATE_ORDER`. */
export function groupItemsByIssueState(
	items: readonly LaunchQueueItem[]
): Record<IssueState, LaunchQueueItem[]> {
	const groups: Record<IssueState, LaunchQueueItem[]> = {
		open: [],
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

/** Operator state for an issue: launch-queue bucket wins, raw Linear state is the fallback. */
export function issueStateFor(
	issue: LinearIssueListItem,
	bucketByIdentifier: Map<string, LaunchQueue>
): IssueState {
	const bucket = bucketByIdentifier.get(issue.identifier)
	if (bucket !== undefined) return mapLaunchQueueToIssueState(bucket)
	return issueStateFromLinear(issue.status.state_type)
}
