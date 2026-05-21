import type { LinearIssueListItem } from './issues'
import type { Run } from './runs'

export type StatusIconKind = 'backlog' | 'todo' | 'progress' | 'needs' | 'review' | 'done' | 'cancelled'

export type PriorityIconKind = 'none' | 'urgent' | 'high' | 'medium' | 'low'

export type TaskBadgeKind = 'needs' | 'running' | 'review' | 'shipped'

export type LifecycleBucket = 'needs' | 'active' | 'launchable' | 'open' | 'done'

export interface LifecycleIssueInput {
	issue: Pick<LinearIssueListItem, 'status'>
	activeRun: Pick<Run, 'state'> | null
	assigneeId: string | null
}
