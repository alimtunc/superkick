import type { LinearIssueListItem, LinearStateType } from '@/types'

// ── Operator-facing filter buckets ────────────────────────────────────
//
// These are Superkick derivations — NOT Linear states.
// Linear remains the source of truth; buckets exist to make
// the Issues surface actionable for launch and inspection.
//
// Mapping:
//   ready     ← unstarted (Todo)       — triaged, launchable
//   active    ← started (In Progress)  — work in progress
//   done      ← completed (Done)       — inspect results
//   dismissed ← canceled (Canceled, Duplicate)
//
// Edge case (SUP-22): an issue in `ready` with an active run
// should arguably be `active`. That reconciliation belongs to
// SUP-22 (run/issue state sync), not here.

export type IssueBucket = 'ready' | 'active' | 'done' | 'dismissed'

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

export interface ClassifiedIssues {
	ready: LinearIssueListItem[]
	active: LinearIssueListItem[]
	done: LinearIssueListItem[]
	dismissed: LinearIssueListItem[]
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
