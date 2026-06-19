import type { ReviewBucket } from '@/types'

export interface ReviewBucketMeta {
	id: ReviewBucket
	label: string
	tone: string
}

// Inbox section order, Linear-like. Active/actionable buckets first.
export const REVIEW_BUCKET_ORDER: ReviewBucketMeta[] = [
	{ id: 'needs_your_review', label: 'Needs your review', tone: 'var(--status-needs)' },
	{ id: 'created_by_you', label: 'Created by you', tone: 'var(--accent)' },
	{ id: 'waiting_for_review', label: 'Waiting for review', tone: 'var(--status-progress)' },
	{ id: 'changes_requested', label: 'Changes requested', tone: 'var(--danger, var(--status-needs))' },
	{ id: 'ready_to_merge', label: 'Ready to merge', tone: 'var(--success, var(--accent))' },
	{ id: 'drafts', label: 'Drafts', tone: 'var(--fg-dim)' },
	{ id: 'completed', label: 'Completed', tone: 'var(--fg-dim)' }
]
