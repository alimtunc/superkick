import type {
	LaunchQueue,
	LaunchQueueItem,
	LinearIssueListItem,
	LinearStateType,
	V1IssueState
} from '@/types'

/**
 * V1 reduction (SUP-92). The launch-queue classifier (server) emits 9
 * buckets; the V1 surface reduces to 6 user-facing states. `waiting` and
 * `blocked` fold into `todo` because the operator's question on those rows
 * is "is this ready to start?" not "what column is it in?" — the badges
 * downstream of this map carry the gating reason.
 *
 * `launchable` → `todo` (it lives in the upstream lane until dispatched —
 * the Dispatch button is the affordance, not a column move). `in-pr` →
 * `in_review` so the V1 vocabulary stays product-facing instead of leaking
 * the GitHub PR phase.
 */
const LAUNCH_QUEUE_TO_V1: Record<LaunchQueue, V1IssueState> = {
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

export function mapLaunchQueueToV1State(bucket: LaunchQueue): V1IssueState {
	return LAUNCH_QUEUE_TO_V1[bucket]
}

/** Canonical left-to-right kanban order. Six entries, exactly. */
export const V1_STATE_ORDER: readonly V1IssueState[] = [
	'backlog',
	'todo',
	'in_progress',
	'needs_human',
	'in_review',
	'done'
] as const

const LINEAR_STATE_TO_V1: Record<LinearStateType, V1IssueState> = {
	backlog: 'backlog',
	unstarted: 'todo',
	started: 'in_progress',
	completed: 'done',
	canceled: 'done'
}

/**
 * Fallback path for issues that do not appear in the launch queue snapshot
 * (Linear-cold issues that the server-side classifier hasn't seen, or
 * cross-team items past the 200-row cap). The Linear `state.type` is the
 * coarsest signal available — V1 collapses `canceled` into `done` to avoid
 * a "dismissed" column the V1 model intentionally drops.
 */
export function v1StateFromLinear(stateType: LinearStateType): V1IssueState {
	return LINEAR_STATE_TO_V1[stateType]
}

/**
 * Reduce a launch-queue item to its V1 state. Issue and run items both
 * derive from the same `bucket` slug, so the discriminator is irrelevant
 * here; kept as a free function so consumers can group regardless of kind.
 */
export function v1StateForLaunchQueueItem(item: LaunchQueueItem): V1IssueState {
	return mapLaunchQueueToV1State(item.bucket)
}

/**
 * Group launch-queue items by their V1 state. Returns a record keyed by
 * every V1 state — empty arrays for empty columns so the kanban can map
 * over `V1_STATE_ORDER` without conditional rendering.
 */
export function groupItemsByV1State(
	items: readonly LaunchQueueItem[]
): Record<V1IssueState, LaunchQueueItem[]> {
	const groups: Record<V1IssueState, LaunchQueueItem[]> = {
		backlog: [],
		todo: [],
		in_progress: [],
		needs_human: [],
		in_review: [],
		done: []
	}
	for (const item of items) {
		groups[v1StateForLaunchQueueItem(item)].push(item)
	}
	return groups
}

/**
 * Contextual badges derived from the launch-queue bucket. The kanban only
 * has six columns (no separate Waiting / Blocked / Launchable), so the
 * upstream gating signals surface here instead. `'launchable'` is rendered
 * as a "Ready" affordance to flag it visually within the Todo lane — the
 * Dispatch button is the action, this is the cue.
 */
export type V1Badge = 'waiting' | 'blocked' | 'launchable' | 'needs-human-attention'

export function extraBadgesForV1(item: LaunchQueueItem): readonly V1Badge[] {
	const badges: V1Badge[] = []
	if (item.bucket === 'waiting') badges.push('waiting')
	if (item.bucket === 'blocked') badges.push('blocked')
	if (item.bucket === 'launchable') badges.push('launchable')
	if (item.kind === 'run' && (item.pending_attention_count > 0 || item.pending_interrupt_count > 0)) {
		badges.push('needs-human-attention')
	}
	return badges
}

/**
 * Narrow a Linear issue to its V1 state by preferring the launch-queue
 * verdict (server-side, captures runs and blockers) and falling back to
 * the raw Linear state when the issue is not present in the snapshot.
 */
export function v1StateForIssue(
	issue: LinearIssueListItem,
	bucketByIdentifier: Map<string, LaunchQueue>
): V1IssueState {
	const bucket = bucketByIdentifier.get(issue.identifier)
	if (bucket !== undefined) return mapLaunchQueueToV1State(bucket)
	return v1StateFromLinear(issue.status.state_type)
}
