import type { ClassifiedIssues, IssueBucket, LinearIssueListItem, LinearStateType } from '@/types'

// Mapping Linear state types to operator-facing buckets.
// ready ← unstarted/backlog · active ← started · done ← completed · dismissed ← canceled
//
// Edge case (SUP-22): an issue in `ready` with an active run should arguably be `active`.
// That reconciliation belongs to SUP-22 (run/issue state sync), not here.
const STATE_TYPE_TO_BUCKET: Record<LinearStateType, IssueBucket> = {
	backlog: 'ready',
	unstarted: 'ready',
	started: 'active',
	completed: 'done',
	canceled: 'dismissed'
}

export const BUCKET_META: Record<IssueBucket, { label: string; color: string }> = {
	ready: { label: 'Ready', color: '#22c55e' },
	active: { label: 'Active', color: '#f59e0b' },
	done: { label: 'Done', color: '#6b7280' },
	dismissed: { label: 'Dismissed', color: '#ef4444' }
}

export const BUCKET_ORDER: IssueBucket[] = ['ready', 'active', 'done', 'dismissed']

export function bucketForIssue(issue: LinearIssueListItem): IssueBucket {
	return STATE_TYPE_TO_BUCKET[issue.status.state_type]
}

export function classifyIssues(issues: LinearIssueListItem[]): ClassifiedIssues {
	const result: ClassifiedIssues = {
		ready: [],
		active: [],
		done: [],
		dismissed: []
	}

	for (const issue of issues) {
		const bucket = bucketForIssue(issue)
		result[bucket].push(issue)
	}

	return result
}
