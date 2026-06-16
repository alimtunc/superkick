import type { QueueRunSummary } from './dashboard'

export type BoardPhase = 'queued' | 'planning' | 'coding' | 'review' | 'pr' | 'done'

export interface BoardCard {
	run: QueueRunSummary
	needsYou: boolean
}

export interface PhaseColumn {
	phase: BoardPhase
	label: string
	cards: BoardCard[]
}
