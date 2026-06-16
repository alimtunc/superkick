import { useMemo, useState } from 'react'

import { fetchReviewInbox } from '@/api'
import { EmptyState, ErrorState, LoadingState } from '@/components/primitives'
import { errorMessageOr } from '@/lib/errors'
import { queryKeys } from '@/lib/queryKeys'
import type { PrInboxItem, ReviewBucket } from '@/types'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { PrRow } from './PrRow'
import { REVIEW_BUCKET_ORDER } from './reviewBuckets'

// Completed (merged/closed) PRs are kept out of the active flow and revealed
// behind an explicit, collapsed-by-default toggle.
const OPEN_BUCKETS = REVIEW_BUCKET_ORDER.filter((bucket) => bucket.id !== 'completed')

export function ReviewsInbox() {
	const [showCompleted, setShowCompleted] = useState(false)
	const { data, isLoading, error, refetch, isRefetching } = useQuery({
		queryKey: queryKeys.reviews.inbox,
		queryFn: fetchReviewInbox,
		staleTime: 15_000,
		refetchInterval: 60_000
	})

	const grouped = useMemo(() => groupByBucket(data ?? []), [data])
	const completed = grouped.get('completed') ?? []
	const total = (data?.length ?? 0) - completed.length

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex items-center gap-3 border-b border-border px-6 py-3">
				<h1 className="text-[14px] font-semibold text-fg">Reviews</h1>
				{total > 0 ? <span className="text-[12px] text-fg-dim">{total} open</span> : null}
				<button
					type="button"
					onClick={() => void refetch()}
					disabled={isRefetching}
					className="ml-auto rounded-[3px] border border-border px-2 py-0.5 text-[11px] text-fg-dim hover:bg-surface hover:text-fg disabled:opacity-50"
				>
					Refresh
				</button>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto">
				{error ? (
					<div className="px-6 py-4">
						<ErrorState
							message={errorMessageOr(error, 'Could not load pull requests')}
							onRetry={() => void refetch()}
							density="compact"
						/>
					</div>
				) : null}

				{isLoading ? (
					<div className="px-6 py-4">
						<LoadingState rows={6} />
					</div>
				) : null}

				{!isLoading && !error && total === 0 && completed.length === 0 ? (
					<EmptyState
						title="No open pull requests"
						description="Open PRs for this project will appear here once gh can reach the repo."
					/>
				) : null}

				{!isLoading && !error && total === 0 && completed.length > 0 ? (
					<p className="px-6 py-4 text-[12px] text-fg-dim">No open pull requests.</p>
				) : null}

				{OPEN_BUCKETS.map((bucket) => renderBucket(bucket, grouped.get(bucket.id)))}

				{completed.length > 0 ? (
					<div className="border-t border-(--border-faint)">
						<button
							type="button"
							onClick={() => setShowCompleted((value) => !value)}
							aria-expanded={showCompleted}
							className="flex w-full items-center gap-1.5 px-4 py-2 text-[12px] text-fg-dim hover:bg-surface hover:text-fg"
						>
							{showCompleted ? (
								<ChevronDown size={13} aria-hidden="true" />
							) : (
								<ChevronRight size={13} aria-hidden="true" />
							)}
							<span className="font-medium">Completed</span>
							<span className="text-fg-muted">{completed.length}</span>
						</button>
						{showCompleted ? completed.map((pr) => <PrRow key={pr.number} pr={pr} />) : null}
					</div>
				) : null}
			</div>
		</div>
	)
}

function renderBucket(bucket: (typeof REVIEW_BUCKET_ORDER)[number], items: PrInboxItem[] | undefined) {
	if (!items || items.length === 0) return null
	return (
		<section key={bucket.id}>
			<div className="bg-bg sticky top-0 z-10 flex items-center gap-2 border-b border-(--border-faint) px-4 py-1.5">
				<span
					aria-hidden="true"
					className="inline-block size-2 shrink-0 rounded-full"
					style={{ background: bucket.tone }}
				/>
				<span className="text-[12px] font-medium text-fg">{bucket.label}</span>
				<span className="text-[11px] text-fg-dim">{items.length}</span>
			</div>
			{items.map((pr) => (
				<PrRow key={pr.number} pr={pr} />
			))}
		</section>
	)
}

function groupByBucket(items: PrInboxItem[]): Map<ReviewBucket, PrInboxItem[]> {
	const grouped = new Map<ReviewBucket, PrInboxItem[]>()
	for (const item of items) {
		const current = grouped.get(item.bucket) ?? []
		grouped.set(item.bucket, [...current, item])
	}
	return grouped
}
