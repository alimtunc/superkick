import type { PullRequest } from './pr'

// Mirrors `superkick_core::ShipMode` (snake_case serde). The operator always
// picks the mode explicitly — Superkick never auto-ships.
export type ShipMode = 'push_only' | 'draft' | 'ready'

// Mirrors `superkick-api` `ShipRunRequest` (camelCase serde).
export interface ShipRunRequest {
	mode: ShipMode
	title?: string
	body?: string
}

// Mirrors `superkick-api` `ShipRunResponse` (camelCase serde). `pr` is null for
// `push_only`. The embedded PullRequest keeps its own snake_case field casing.
export interface ShipRunResponse {
	pushedBranch: string
	pr: PullRequest | null
}

// UI-only: the operator's Linear status choice in the ship modal. `no_change`
// leaves the issue untouched; the others resolve to a concrete workflow state.
export type LinearStatusChoice = 'no_change' | 'in_review' | 'done'
