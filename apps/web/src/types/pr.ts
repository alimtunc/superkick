export type PrState = 'open' | 'draft' | 'merged' | 'closed'

export interface LinkedPrSummary {
	number: number
	url: string
	state: PrState
	// Skipped on the wire when the PR is unmerged (serde skip_serializing_if).
	merged_at?: string | null
}

export interface PullRequest {
	id: string
	run_id: string
	number: number
	repo_slug: string
	url: string
	state: PrState
	title: string
	head_branch: string
	created_at: string
	updated_at: string
	merged_at: string | null
}

export type IssuePullRequestSource = 'linear_attachment' | 'github_search' | 'manual'

export interface IssuePullRequest {
	issue_id: string
	issue_identifier: string
	repo_slug: string
	number: number
	url: string
	state: PrState
	title: string
	head_branch: string
	head_sha: string
	base_branch: string
	source: IssuePullRequestSource
	created_at: string
	updated_at: string
	merged_at: string | null
	synced_at: string
}

export type IssuePrDiffFileStatus = 'added' | 'modified' | 'removed' | 'renamed' | 'changed' | 'unchanged'

export interface IssuePrDiffFile {
	path: string
	old_path?: string | null
	status: IssuePrDiffFileStatus
	additions: number
	deletions: number
	patch?: string | null
	position: number
}

export interface IssuePullRequestDiffResponse {
	pr: IssuePullRequest
	files: IssuePrDiffFile[]
	cached: boolean
}
