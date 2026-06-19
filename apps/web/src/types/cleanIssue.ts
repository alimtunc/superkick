export type CleanIssueMode = 'archive' | 'purge'

export interface CleanIssueResponse {
	mode: CleanIssueMode
	runs: number
	launch_tasks: number
}
