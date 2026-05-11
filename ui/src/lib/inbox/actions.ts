import type {
	InboxAction,
	InboxActionContext,
	InboxActionVerb,
	NeedsHumanItem,
	QueueRunSummary,
	RecentlyDoneEntry
} from '@/types'

const VERB_LABEL: Record<InboxActionVerb, string> = {
	answer: 'Answer',
	approve: 'Approve',
	review: 'Review',
	resume: 'Resume',
	takeover: 'Take over',
	launch: 'Launch',
	view: 'View'
}

const VERB_GERUND: Record<InboxActionVerb, string> = {
	answer: 'Answering',
	approve: 'Approving',
	review: 'Reviewing',
	resume: 'Resuming',
	takeover: 'Taking over',
	launch: 'Launching',
	view: 'Viewing'
}

export function pickPrimaryAction(ctx: InboxActionContext): InboxAction {
	switch (ctx.kind) {
		case 'needs-human':
			return primaryForNeedsHuman(ctx.item)
		case 'queue-run':
			return primaryForQueueRun(ctx.run)
		case 'recently-done':
			return primaryForRecentlyDone(ctx.entry)
		case 'ready-to-launch':
			return mkAction('launch', { kind: 'dispatch' })
	}
}

export function pickSecondaryAction(ctx: InboxActionContext, primary?: InboxAction): InboxAction | null {
	switch (ctx.kind) {
		case 'needs-human':
			return secondaryForNeedsHuman(ctx.item)
		case 'queue-run':
			return secondaryForQueueRun(ctx.run, primary ?? primaryForQueueRun(ctx.run))
		case 'recently-done':
		case 'ready-to-launch':
			return null
	}
}

export function inboxActionAriaLabel(action: InboxAction, identifier: string): string {
	return `${action.label} ${identifier}`
}

export function pendingLabel(verb: InboxActionVerb): string {
	return VERB_GERUND[verb]
}

function primaryForNeedsHuman(item: NeedsHumanItem): InboxAction {
	switch (item.reasonKind) {
		case 'awaiting_approval':
			return mkAction('approve', { kind: 'issue', issueId: item.source.item.issue.id })
		case 'attention_pending':
			return mkAction('answer', { kind: 'run', runId: runIdFromSource(item), openChat: true })
		case 'interrupt_pending':
			return mkAction('takeover', { kind: 'run', runId: runIdFromSource(item), hash: 'terminal' })
		case 'stalled':
		case 'budget_paused':
			return mkAction('resume', { kind: 'run', runId: runIdFromSource(item) })
		case 'recently_failed':
			return reviewForRun(item)
	}
}

function secondaryForNeedsHuman(item: NeedsHumanItem): InboxAction | null {
	switch (item.reasonKind) {
		case 'awaiting_approval':
			return null
		case 'interrupt_pending':
		case 'recently_failed':
			return mkAction('view', { kind: 'run', runId: runIdFromSource(item) })
		case 'attention_pending':
		case 'stalled':
		case 'budget_paused':
			return mkAction('takeover', { kind: 'run', runId: runIdFromSource(item), hash: 'terminal' })
	}
}

function primaryForQueueRun(run: QueueRunSummary): InboxAction {
	if (run.pending_interrupt_count > 0) {
		return mkAction('takeover', { kind: 'run', runId: run.id, hash: 'terminal' })
	}
	if (run.pending_attention_count > 0) {
		return mkAction('answer', { kind: 'run', runId: run.id, openChat: true })
	}
	if (run.stalled_for_seconds != null && run.stalled_reason != null) {
		return mkAction('resume', { kind: 'run', runId: run.id })
	}
	if (run.pause_kind === 'budget') {
		return mkAction('resume', { kind: 'run', runId: run.id })
	}
	if (run.state === 'failed') {
		return run.pr
			? mkAction('review', { kind: 'external', href: run.pr.url })
			: mkAction('review', { kind: 'run', runId: run.id })
	}
	if (run.pr) {
		return mkAction('review', { kind: 'external', href: run.pr.url })
	}
	return mkAction('view', { kind: 'run', runId: run.id })
}

function secondaryForQueueRun(run: QueueRunSummary, primary: InboxAction): InboxAction | null {
	if (primary.verb === 'takeover') return mkAction('view', { kind: 'run', runId: run.id })
	if (primary.verb === 'view') return null
	return mkAction('takeover', { kind: 'run', runId: run.id, hash: 'terminal' })
}

function primaryForRecentlyDone(entry: RecentlyDoneEntry): InboxAction {
	const item = entry.item
	if (item.kind === 'run') {
		if (item.pr) return mkAction('review', { kind: 'external', href: item.pr.url })
		return mkAction('view', { kind: 'run', runId: item.run.id })
	}
	return mkAction('view', { kind: 'issue', issueId: item.issue.id })
}

function reviewForRun(item: NeedsHumanItem): InboxAction {
	const pr = item.source.kind === 'queue-run' ? item.source.run.pr : undefined
	if (pr) return mkAction('review', { kind: 'external', href: pr.url })
	return mkAction('review', { kind: 'run', runId: runIdFromSource(item) })
}

// Only callable for reasonKinds whose source is a Run, never a launch-issue.
// Throwing here makes the unreachable case loud — see callers in
// `primaryForNeedsHuman` / `secondaryForNeedsHuman`.
function runIdFromSource(item: NeedsHumanItem): string {
	if (item.source.kind === 'launch-issue') {
		throw new Error(`runIdFromSource: '${item.reasonKind}' must not have a launch-issue source`)
	}
	return item.source.run.id
}

function mkAction(verb: InboxActionVerb, destination: InboxAction['destination']): InboxAction {
	return { verb, label: VERB_LABEL[verb], destination }
}
