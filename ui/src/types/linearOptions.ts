/**
 * Picker options served by `GET /linear/options`. Mirrors the Rust
 * `LinearOptions` contract in `superkick-integrations/linear/types/contract.rs`.
 *
 * Workflow states are keyed by owning team id because Linear scopes them
 * per-team; the create/edit pickers must filter by the issue's team_id.
 * Labels carry `team_id: null` when workspace-wide, otherwise scoped.
 */
export interface TeamOption {
	id: string
	key: string
	name: string
}

export interface UserOption {
	id: string
	name: string
	avatar_url: string | null
}

export interface ProjectOption {
	id: string
	name: string
	color: string | null
	state: string | null
}

export interface LabelOption {
	id: string
	name: string
	color: string
	team_id: string | null
}

import type { LinearStateType } from './issues'

export interface WorkflowStateOption {
	id: string
	name: string
	state_type: LinearStateType
	color: string
	position: number
}

export interface LinearOptions {
	teams: TeamOption[]
	users: UserOption[]
	projects: ProjectOption[]
	labels: LabelOption[]
	workflow_states_by_team: Record<string, WorkflowStateOption[]>
}
