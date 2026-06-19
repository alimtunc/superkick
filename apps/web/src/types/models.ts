// Mirror of `superkick_core::ModelInfo` — one entry in the curated per-provider
// model catalog served by `GET /api/providers/{provider}/models`.
export interface ModelInfo {
	id: string
	label: string
	is_default: boolean
}
