import type { IssueState, LinearIssueListItem } from './issues'
import type { LaunchQueue, LaunchQueueItem } from './launchQueue'

export interface IssueWithState {
	issue: LinearIssueListItem
	state: IssueState
	bucket: LaunchQueue | undefined
	linkedRun: Extract<LaunchQueueItem, { kind: 'run' }> | undefined
}
