import type { AttentionKind } from './attention'
import type { ExecutionMode } from './runs'

export interface CreateRunRequest {
	repo_slug: string
	issue_id: string
	issue_identifier: string
	base_branch?: string
	use_worktree?: boolean
	execution_mode?: ExecutionMode
	operator_instructions?: string
}

export interface CreateAttentionRequest {
	kind: AttentionKind
	title: string
	body: string
	options?: string[]
}
