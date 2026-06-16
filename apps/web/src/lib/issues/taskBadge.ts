import type { IssueWithState, LifecycleBucket, TaskBadgeKind } from '@/types'

const SHIPPED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export const TASK_KIND_BG: Record<TaskBadgeKind, string> = {
	needs: 'bg-[var(--status-needs)]',
	running: 'bg-accent',
	review: 'bg-[var(--status-review)]',
	shipped: 'bg-success'
}

/**
 * Map a lifecycle bucket + issue into the badge that surfaces agent activity.
 * Returns `null` when the row should render no badge at all — the bar / chip
 * is reserved for live signals, not decoration.
 *
 * Priority order (first match wins):
 *  1. `needs`  — bucket = needs (run waiting on a human)
 *  2. `running` — bucket = active (run progressing)
 *  3. `review` — linked run in `reviewing` or `opening_pr`
 *  4. `shipped` — bucket = done and Linear `completed_at` within the rolling week
 *  5. `null` — no signal worth carrying
 *
 * Caller is expected to pass the already-classified bucket from
 * `bucketFor()` so the lifecycle rules stay in one place.
 */
export function taskBadgeKindFor(
	issue: IssueWithState,
	bucket: LifecycleBucket,
	now: Date = new Date()
): TaskBadgeKind | null {
	if (bucket === 'needs') return 'needs'
	if (bucket === 'active') return 'running'

	const runState = issue.linkedRun?.run.state
	if (runState === 'reviewing' || runState === 'opening_pr') return 'review'

	if (bucket === 'done' && shippedWithinWindow(issue, now)) return 'shipped'

	return null
}

function shippedWithinWindow(issue: IssueWithState, now: Date): boolean {
	const ts = issue.issue.completed_at
	if (!ts) return false
	const completed = new Date(ts).getTime()
	if (Number.isNaN(completed)) return false
	return now.getTime() - completed <= SHIPPED_WINDOW_MS
}
