import type { IssueBoardColumns, IssueState, IssueWithState, LaunchQueue, LaunchQueueItem } from '@/types'

/** Wrap a filtered `IssueWithState` so existing kanban components can consume the same view-model. */
export function issueWithStateToLaunchQueueItem(wrapper: IssueWithState): LaunchQueueItem {
	if (wrapper.linkedRun) return wrapper.linkedRun
	return {
		kind: 'issue',
		issue: wrapper.issue,
		bucket: wrapper.bucket ?? fallbackBucket(wrapper),
		reason: wrapper.reason ?? ''
	}
}

export function projectBoardColumns(columns: IssueBoardColumns): Record<IssueState, LaunchQueueItem[]> {
	return {
		needs_human: columns.needs_human.map(issueWithStateToLaunchQueueItem),
		backlog: columns.backlog.map(issueWithStateToLaunchQueueItem),
		todo: columns.todo.map(issueWithStateToLaunchQueueItem),
		in_progress: columns.in_progress.map(issueWithStateToLaunchQueueItem),
		in_review: columns.in_review.map(issueWithStateToLaunchQueueItem),
		done: columns.done.map(issueWithStateToLaunchQueueItem)
	}
}

function fallbackBucket(wrapper: IssueWithState): LaunchQueue {
	const stateType = wrapper.issue.status.state_type
	if (stateType === 'completed' || stateType === 'canceled') return 'done'
	if (stateType === 'backlog') return 'backlog'
	if (stateType === 'started') return 'launchable'
	return 'todo'
}
