export type PrState = 'open' | 'draft' | 'merged' | 'closed'

export interface LinkedPrSummary {
	number: number
	url: string
	state: PrState
	merged_at: string | null
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
