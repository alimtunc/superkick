import { fetchPrActivity } from '@/api'
import { IssueTimelineEvent } from '@/components/issue-detail/IssueTimelineEvent'
import { EmptyState } from '@/components/ui/state-empty'
import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
import { fmtRelativeTime } from '@/lib/domain'
import { errorMessageOr } from '@/lib/errors'
import { sanitizeGithubMarkdown } from '@/lib/markdown'
import { queryKeys } from '@/lib/queryKeys'
import { useQuery } from '@tanstack/react-query'

import { PrActivityComposer } from './PrActivityComposer'
import { PrReviewCommentCard } from './PrReviewCommentCard'
import { systemView } from './reviewStatus'

interface PrActivityTimelineProps {
	number: number
	headSha: string
}

export function PrActivityTimeline({ number, headSha }: PrActivityTimelineProps) {
	const { data, isLoading, error, refetch } = useQuery({
		queryKey: queryKeys.reviews.activity(number),
		queryFn: () => fetchPrActivity(number),
		staleTime: 15_000
	})

	if (isLoading) {
		return <LoadingState rows={4} />
	}
	if (error) {
		return (
			<ErrorState
				message={errorMessageOr(error, 'Could not load activity')}
				onRetry={() => void refetch()}
				density="compact"
			/>
		)
	}

	const events = data ?? []

	return (
		<section aria-label="Activity">
			{events.length === 0 ? (
				<EmptyState title="No activity yet" density="compact" />
			) : (
				<div className="feed">
					{events.map((event, index) => {
						const key = `${event.createdAt}-${event.kind}-${event.actor}-${index}`
						const actor = event.actor || 'someone'
						const body = sanitizeGithubMarkdown(event.body ?? '')
						if (body) {
							return (
								<PrReviewCommentCard
									key={key}
									actor={actor}
									body={body}
									createdAt={event.createdAt}
									decision={event.decision}
									filePath={event.filePath}
								/>
							)
						}
						const view = systemView(event)
						return (
							<IssueTimelineEvent
								key={key}
								kind={view.kind}
								role={view.role}
								who={actor}
								time={fmtRelativeTime(event.createdAt)}
							>
								{view.phrase}
							</IssueTimelineEvent>
						)
					})}
				</div>
			)}
			<PrActivityComposer number={number} headSha={headSha} />
		</section>
	)
}
