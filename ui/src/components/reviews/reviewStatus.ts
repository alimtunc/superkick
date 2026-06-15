import type {
	ActivityNodeKind,
	ActivityNodeRole,
	GithubReviewDecision,
	PrActivityEvent,
	PrInboxItem
} from '@/types'
import type { PillTone } from '@/types/ui'

interface PrStatusView {
	label: string
	tone: PillTone
}

/** The single Linear-style status pill for a PR (rail + header). */
export function prReviewStatus(pr: PrInboxItem): PrStatusView {
	if (pr.state === 'merged') return { label: 'Merged', tone: 'accent' }
	if (pr.state === 'closed') return { label: 'Closed', tone: 'danger' }
	if (pr.isDraft || pr.state === 'draft') return { label: 'Draft', tone: 'neutral' }
	switch (pr.reviewDecision) {
		case 'approved':
			return { label: 'Ready for merge', tone: 'success' }
		case 'changes_requested':
			return { label: 'Changes requested', tone: 'danger' }
		default:
			return { label: 'Open', tone: 'accent' }
	}
}

interface ReviewerStateView {
	label: string
	tone: PillTone
}

/** A reviewer's latest decision, as a compact rail chip. */
export function reviewerStateView(state?: GithubReviewDecision | null): ReviewerStateView {
	switch (state) {
		case 'approved':
			return { label: 'Approved', tone: 'success' }
		case 'changes_requested':
			return { label: 'Changes requested', tone: 'danger' }
		case 'commented':
			return { label: 'Commented', tone: 'neutral' }
		case 'dismissed':
			return { label: 'Dismissed', tone: 'neutral' }
		default:
			return { label: 'Requested', tone: 'neutral' }
	}
}

interface SystemView {
	kind: ActivityNodeKind
	role: ActivityNodeRole
	phrase: string
}

/** A non-comment activity event rendered as a system timeline line. */
export function systemView(event: PrActivityEvent): SystemView {
	switch (event.kind) {
		case 'opened':
			return { kind: 'pr', role: 'info', phrase: 'opened this pull request' }
		case 'review_requested':
			return { kind: 'system', role: 'neutral', phrase: 'was requested for review' }
		case 'commented':
			return { kind: 'user', role: 'neutral', phrase: 'commented' }
		case 'review_submitted':
			switch (event.decision) {
				case 'approved':
					return { kind: 'check', role: 'success', phrase: 'approved these changes' }
				case 'changes_requested':
					return { kind: 'flag', role: 'danger', phrase: 'requested changes' }
				case 'commented':
					return { kind: 'user', role: 'neutral', phrase: 'commented' }
				default:
					return { kind: 'check', role: 'neutral', phrase: 'reviewed' }
			}
	}
}
