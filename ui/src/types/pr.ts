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
