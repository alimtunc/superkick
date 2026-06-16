import type {
	BoardCard,
	BoardPhase,
	LaunchQueue,
	LaunchQueueItem,
	OperatorQueue,
	StatusIconKind
} from '@/types'

const QUEUE_TO_LAUNCH_QUEUE: Record<OperatorQueue, LaunchQueue> = {
	waiting: 'waiting',
	active: 'active',
	'in-pr': 'in-pr',
	done: 'done',
	'blocked-by-dependency': 'blocked',
	'needs-human': 'needs-human'
}

export const PHASE_TO_STATUS_KIND: Record<BoardPhase, StatusIconKind> = {
	queued: 'todo',
	planning: 'progress',
	coding: 'progress',
	review: 'review',
	pr: 'review',
	done: 'done'
}

export function boardCardToLaunchRunItem(card: BoardCard): Extract<LaunchQueueItem, { kind: 'run' }> {
	return {
		kind: 'run',
		run: card.run,
		bucket: QUEUE_TO_LAUNCH_QUEUE[card.run.queue],
		reason: card.run.reason,
		pending_attention_count: card.run.pending_attention_count,
		pending_interrupt_count: card.run.pending_interrupt_count,
		pr: card.run.pr,
		linked_issue: { identifier: card.run.issue_identifier, title: '', url: '' }
	}
}
