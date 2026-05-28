import type { IssueAssignee, IssueLabel, LinearStateType } from './issues'

export interface WorkflowStateRef {
	id: string
	name: string
	color: string
	state_type: LinearStateType
}

export interface ProjectRef {
	id: string
	name: string
}

export interface CycleRef {
	id: string
	name: string | null
	number: number
}

export type IssueHistoryEvent =
	| { kind: 'status_changed'; from: WorkflowStateRef; to: WorkflowStateRef }
	| { kind: 'assignee_changed'; from: IssueAssignee | null; to: IssueAssignee | null }
	| { kind: 'priority_changed'; from: number; to: number }
	| { kind: 'labels_changed'; added: IssueLabel[]; removed: IssueLabel[] }
	| { kind: 'project_changed'; from: ProjectRef | null; to: ProjectRef | null }
	| { kind: 'cycle_changed'; from: CycleRef | null; to: CycleRef | null }
	| { kind: 'estimate_changed'; from: number | null; to: number | null }
	| { kind: 'due_date_changed'; from: string | null; to: string | null }
	| { kind: 'title_changed'; from: string; to: string }
	| { kind: 'description_edited' }
	| { kind: 'created' }

export interface IssueHistoryEntry {
	id: string
	created_at: string
	actor: IssueAssignee | null
	events: IssueHistoryEvent[]
}
