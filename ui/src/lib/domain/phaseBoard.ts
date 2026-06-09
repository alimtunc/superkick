import type {
	BoardCard,
	BoardPhase,
	OperatorQueue,
	PhaseColumn,
	QueueRunSummary,
	RunState,
	StepKey
} from '@/types'
import { OPERATOR_QUEUES } from '@/types'

import { RECENT_CAP, terminalSortKey } from './runGroups'
import { isTerminalRunState, pickLatestRun } from './runState'

export const PHASE_ORDER: BoardPhase[] = ['queued', 'planning', 'coding', 'review', 'pr', 'done']

export const PHASE_LABEL: Record<BoardPhase, string> = {
	queued: 'Queued',
	planning: 'Planning',
	coding: 'Coding',
	review: 'Review',
	pr: 'PR',
	done: 'Done'
}

export const PHASE_DESCRIPTION: Record<BoardPhase, string> = {
	queued: 'Launched, not started yet.',
	planning: 'Agent is planning.',
	coding: 'Implementation in progress.',
	review: 'Review swarm running.',
	pr: 'PR open — review or merge.',
	done: 'Recently completed.'
}

export const PHASE_TEXT_CLASS: Record<BoardPhase, string> = {
	queued: 'text-fg-dim',
	planning: 'text-info',
	coding: 'text-success',
	review: 'text-accent',
	pr: 'text-warn',
	done: 'text-fg-muted'
}

export const PHASE_BORDER_CLASS: Record<BoardPhase, string> = {
	queued: '',
	planning: 'border-t-info',
	coding: 'border-t-success',
	review: 'border-t-accent',
	pr: 'border-t-warn',
	done: ''
}

export function boardNeedsYou(run: QueueRunSummary): boolean {
	return (
		run.queue === 'needs-human' ||
		run.queue === 'blocked-by-dependency' ||
		run.state === 'waiting_human' ||
		run.pause_kind !== 'none' ||
		run.pending_attention_count > 0
	)
}

export function phaseForRun(run: QueueRunSummary): BoardPhase {
	if (run.queue === 'in-pr' || run.state === 'opening_pr') return 'pr'
	if (isTerminalRunState(run.state)) return 'done'
	if (run.state === 'waiting_human') return phaseFromStepKey(run.current_step_key)
	return phaseFromState(run.state)
}

export function toPhaseColumns(groups: Record<OperatorQueue, QueueRunSummary[]>): PhaseColumn[] {
	const all = OPERATOR_QUEUES.flatMap((q) => groups[q] ?? [])
	const buckets = emptyBuckets()
	for (const run of representativeRunByIssue(all)) {
		const phase = phaseForRun(run)
		buckets[phase].push({ run, needsYou: phase === 'done' ? false : boardNeedsYou(run) })
	}
	return PHASE_ORDER.map((phase) => ({
		phase,
		label: PHASE_LABEL[phase],
		cards: phase === 'done' ? sortDone(buckets.done) : sortLive(buckets[phase])
	}))
}

function phaseFromState(state: RunState): BoardPhase {
	switch (state) {
		case 'queued':
		case 'preparing':
			return 'queued'
		case 'planning':
			return 'planning'
		case 'coding':
		case 'running_commands':
			return 'coding'
		case 'reviewing':
			return 'review'
		case 'opening_pr':
			return 'pr'
		case 'waiting_human':
			return 'coding'
		case 'completed':
		case 'failed':
		case 'cancelled':
			return 'done'
	}
}

function phaseFromStepKey(step: StepKey | null): BoardPhase {
	switch (step) {
		case 'prepare':
			return 'queued'
		case 'plan':
			return 'planning'
		case 'code':
		case 'commands':
			return 'coding'
		case 'review_swarm':
			return 'review'
		case 'create_pr':
			return 'pr'
		case 'await_human':
		case null:
			return 'coding'
	}
}

function emptyBuckets(): Record<BoardPhase, BoardCard[]> {
	return { queued: [], planning: [], coding: [], review: [], pr: [], done: [] }
}

function representativeRunByIssue(runs: QueueRunSummary[]): QueueRunSummary[] {
	const byIssue = new Map<string, QueueRunSummary[]>()
	for (const run of runs) {
		const list = byIssue.get(run.issue_id)
		if (list) list.push(run)
		else byIssue.set(run.issue_id, [run])
	}
	const out: QueueRunSummary[] = []
	for (const list of byIssue.values()) {
		const latest = pickLatestRun(list)
		if (latest) out.push(latest)
	}
	return out
}

function sortLive(cards: BoardCard[]): BoardCard[] {
	return [...cards].toSorted((a, b) => {
		if (a.needsYou !== b.needsYou) return a.needsYou ? -1 : 1
		return new Date(a.run.started_at).getTime() - new Date(b.run.started_at).getTime()
	})
}

function sortDone(cards: BoardCard[]): BoardCard[] {
	return [...cards].toSorted((a, b) => terminalSortKey(b.run) - terminalSortKey(a.run)).slice(0, RECENT_CAP)
}
