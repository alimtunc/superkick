import { useMemo } from 'react'

import { fetchReviewInbox } from '@/api'
import { EmptyState } from '@/components/ui/state-empty'
import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
import { errorMessageOr } from '@/lib/errors'
import { queryKeys } from '@/lib/queryKeys'
import type { PrInboxItem, ReviewBucket } from '@/types'
import { useQuery } from '@tanstack/react-query'

import { PrRow } from './PrRow'
import { REVIEW_BUCKET_ORDER } from './reviewBuckets'

export function ReviewsInbox() {
	const { data, isLoading, error, refetch, isRefetching } = useQuery({
		queryKey: queryKeys.reviews.inbox,
		queryFn: fetchReviewInbox,
		staleTime: 15_000,
		refetchInterval: 60_000
	})

	const grouped = useMemo(() => groupByBucket(data ?? []), [data])
	const total = data?.length ?? 0

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

				{!isLoading && !error && total === 0 ? (
					<EmptyState
						title="No pull requests"
						description="Open PRs for this project will appear here once gh can reach the repo."
					/>
				) : null}

				{REVIEW_BUCKET_ORDER.map((bucket) => {
					const items = grouped.get(bucket.id)
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
				})}
			</div>
		</div>
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
