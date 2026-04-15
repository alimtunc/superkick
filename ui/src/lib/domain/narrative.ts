import type { AttentionRequest, Interrupt, RunState } from '@/types'

export type NarrativeTone = 'active' | 'attention' | 'success' | 'failure' | 'idle'

export interface RunNarrative {
	phase: string
	headline: string
	nextHint: string
	tone: NarrativeTone
}

const NARRATIVE: Record<RunState, RunNarrative> = {
	queued: {
		phase: 'Queued',
		headline: 'Waiting to start',
		nextHint: 'Will begin as soon as a runner is free',
		tone: 'idle'
	},
	preparing: {
		phase: 'Preparing',
		headline: 'Setting up the workspace',
		nextHint: 'Planning will start once the worktree is ready',
		tone: 'active'
	},
	planning: {
		phase: 'Planning',
		headline: 'Drafting an approach',
		nextHint: 'Next: start coding against the plan',
		tone: 'active'
	},
	coding: {
		phase: 'Coding',
		headline: 'Writing the change',
		nextHint: 'Next: run commands and enter review',
		tone: 'active'
	},
	running_commands: {
		phase: 'Commands',
		headline: 'Running verification commands',
		nextHint: 'Next: hand off to the review swarm',
		tone: 'active'
	},
	reviewing: {
		phase: 'Review',
		headline: 'Review swarm is checking the change',
		nextHint: 'Next: open a PR if the gate passes',
		tone: 'active'
	},
	waiting_human: {
		phase: 'Awaiting you',
		headline: 'Needs a human decision',
		nextHint: 'Reply below to unblock the run',
		tone: 'attention'
	},
	opening_pr: {
		phase: 'PR',
		headline: 'Opening the pull request',
		nextHint: 'Next: wrap up and mark the issue done',
		tone: 'active'
	},
	completed: {
		phase: 'Done',
		headline: 'Run completed',
		nextHint: 'PR is ready for your review',
		tone: 'success'
	},
	failed: {
		phase: 'Failed',
		headline: 'Run did not finish',
		nextHint: 'Inspect the details below and decide next steps',
		tone: 'failure'
	},
	cancelled: {
		phase: 'Cancelled',
		headline: 'Run was cancelled',
		nextHint: 'You can start a new run when ready',
		tone: 'idle'
	}
}

export function runNarrative(state: RunState): RunNarrative {
	return NARRATIVE[state]
}

export interface AttentionSummary {
	pendingAttention: number
	pendingInterrupts: number
	total: number
}

export function attentionHint(total: number): string | null {
	if (total === 0) return null
	if (total === 1) return '1 open request waiting on you'
	return `${total} open requests waiting on you`
}

export function summarizeAttention(
	attentionRequests: AttentionRequest[],
	interrupts: Interrupt[]
): AttentionSummary {
	const pendingAttention = attentionRequests.filter((r) => r.status === 'pending').length
	const pendingInterrupts = interrupts.filter((i) => i.status === 'pending').length
	return {
		pendingAttention,
		pendingInterrupts,
		total: pendingAttention + pendingInterrupts
	}
}

export const toneTextClass: Record<NarrativeTone, string> = {
	active: 'text-cyan',
	attention: 'text-gold',
	success: 'text-mineral',
	failure: 'text-oxide',
	idle: 'text-dim'
}

export const toneAccentClass: Record<NarrativeTone, string> = {
	active: 'border-cyan/30 bg-cyan/5',
	attention: 'border-gold/40 bg-gold/8',
	success: 'border-mineral/30 bg-mineral/5',
	failure: 'border-oxide/40 bg-oxide/8',
	idle: 'border-edge bg-graphite/40'
}

export const toneDotClass: Record<NarrativeTone, string> = {
	active: 'bg-cyan live-pulse',
	attention: 'bg-gold live-pulse',
	success: 'bg-mineral',
	failure: 'bg-oxide',
	idle: 'bg-dim'
}
