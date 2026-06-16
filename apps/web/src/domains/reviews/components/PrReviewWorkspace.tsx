import { useMemo, useState } from 'react'

import { fetchPrDetail } from '@/api'
import { EmptyState, ErrorState, LoadingState } from '@/components/primitives'
import { usePrDiff } from '@/hooks/usePrDiff'
import { errorMessageOr } from '@/lib/errors'
import { queryKeys } from '@/lib/queryKeys'
import { usePageActions } from '@/shell/usePageActions'
import type { PrReviewTab } from '@/types'
import { useQuery } from '@tanstack/react-query'

import { PrActivityTimeline } from './PrActivityTimeline'
import { PrDescription } from './PrDescription'
import { PrDiffTab } from './PrDiffTab'
import { PrReviewHead } from './PrReviewHead'
import { PrReviewRail } from './PrReviewRail'
import { reviewPanelId, reviewTabId } from './reviewChrome'

interface PrReviewWorkspaceProps {
	number: number
}

export function PrReviewWorkspace({ number }: PrReviewWorkspaceProps) {
	usePageActions({ title: 'Reviews', crumbs: [] })
	const [tab, setTab] = useState<PrReviewTab>('activity')
	const { data, isLoading, error, refetch } = useQuery({
		queryKey: queryKeys.reviews.detail(number),
		queryFn: () => fetchPrDetail(number),
		staleTime: 15_000
	})
	const diffQuery = usePrDiff(number, Boolean(data))

	const diffStats = useMemo(() => {
		const files = diffQuery.data?.files
		if (!files || files.length === 0) return null
		return files.reduce(
			(acc, file) => ({
				additions: acc.additions + file.additions,
				deletions: acc.deletions + file.deletions
			}),
			{ additions: 0, deletions: 0 }
		)
	}, [diffQuery.data])

	if (isLoading) {
		return (
			<div className="px-6 py-4">
				<LoadingState rows={6} />
			</div>
		)
	}
	if (error) {
		return (
			<div className="px-6 py-4">
				<ErrorState
					message={errorMessageOr(error, 'Could not load this pull request')}
					onRetry={() => void refetch()}
					density="compact"
				/>
			</div>
		)
	}
	if (!data) {
		return <EmptyState title="Pull request not found" density="compact" />
	}

	const pr = data.pullRequest

	return (
		<div className="flex h-full min-h-0 flex-col">
			<PrReviewHead pr={pr} diffStats={diffStats} tab={tab} onTabChange={setTab} />
			<div className="min-h-0 flex-1">
				{tab === 'activity' ? (
					<div
						className="detail"
						role="tabpanel"
						id={reviewPanelId('activity')}
						aria-labelledby={reviewTabId('activity')}
					>
						<div className="detail__body">
							<div className="detail__inner">
								{data.body ? <PrDescription body={data.body} /> : null}
								<PrActivityTimeline number={number} headSha={pr.headSha} />
							</div>
						</div>
						<PrReviewRail
							pr={pr}
							linkedIssueId={data.linkedIssueId}
							diffFiles={diffQuery.data?.files ?? []}
							diffLoading={diffQuery.isLoading}
							onOpenDiff={() => setTab('diff')}
						/>
					</div>
				) : (
					<div
						className="flex h-full min-h-0 flex-col"
						role="tabpanel"
						id={reviewPanelId('diff')}
						aria-labelledby={reviewTabId('diff')}
					>
						<PrDiffTab detail={data} />
					</div>
				)}
			</div>
		</div>
	)
}
