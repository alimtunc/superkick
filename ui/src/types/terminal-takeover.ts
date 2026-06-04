/**
 * SUP-101 — terminal takeover wire types.
 *
 * Mirrors the backend `TakeoverMode` / availability snapshot. Kept honest
 * on purpose: an unavailable mode carries a `reason` so the UI can show
 * "why" instead of greying a button silently.
 */

export type TakeoverModeKind = 'inspect' | 'interactive_continuation' | 'force_takeover'

export type ForceTakeoverSubMode = 'inspect' | 'interactive_continuation'

/**
 * How a takeover actually connected, independent of the mode the operator asked
 * for. `attach` joined a live PTY, `resume` restored the provider session,
 * `fresh` spawned a new process seeded with the run snapshot.
 */
export type TakeoverPath = 'attach' | 'resume' | 'fresh'

/**
 * Open-takeover request body. The backend deserialises with `#[serde(flatten)]`
 * so the discriminator (`mode`), force-mode payload, and `operator_id` all sit
 * at the top level of the JSON object.
 */
export type OpenTakeoverRequest =
	| { mode: 'inspect'; operator_id?: string }
	| { mode: 'interactive_continuation'; operator_id?: string }
	| {
			mode: 'force_takeover'
			sub_mode: ForceTakeoverSubMode
			confirm_force: true
			operator_id?: string
	  }

export interface TakeoverModeAvailability {
	mode: TakeoverModeKind
	available: boolean
	reason: string | null
	resume_supported: boolean
}

export interface TakeoverModesResponse {
	modes: TakeoverModeAvailability[]
}

export interface OpenedTakeover {
	takeover_session_id: string
	mode: TakeoverModeKind
	/**
	 * Honest outcome of the attach → resume → fresh strategy. Optional only
	 * because the UI synthesises an `OpenedTakeover` when re-anchoring to a
	 * persisted takeover (which carries no path).
	 */
	takeover_path?: TakeoverPath
	terminal_ws: string
}

export interface ActiveTakeover {
	takeover_session_id: string
	mode: TakeoverModeKind
	opened_at: string
	operator_id: string | null
}

export interface ActiveTakeoversResponse {
	takeovers: ActiveTakeover[]
}

export type TerminalStatus = 'connecting' | 'live' | 'readonly' | 'ended' | 'history'

export interface TerminalCapabilities {
	writable: boolean
	reason: string
}
