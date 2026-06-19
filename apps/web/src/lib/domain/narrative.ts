import type {
	AttentionRequest,
	AttentionSummary,
	Interrupt,
	NarrativeTone,
	RunNarrative,
	RunState
} from '@/types'

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
	active: 'text-info',
	attention: 'text-warn',
	success: 'text-success',
	failure: 'text-danger',
	idle: 'text-fg-dim'
}

export const toneAccentClass: Record<NarrativeTone, string> = {
	active: 'border-info/30 bg-info/5',
	attention: 'border-warn/40 bg-warn/8',
	success: 'border-success/30 bg-success/5',
	failure: 'border-danger/40 bg-danger/8',
	idle: 'border-border bg-surface/40'
}

export const toneDotClass: Record<NarrativeTone, string> = {
	active: 'bg-info live-pulse',
	attention: 'bg-warn live-pulse',
	success: 'bg-success',
	failure: 'bg-danger',
	idle: 'bg-fg-dim'
}
