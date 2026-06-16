import { useMemo } from 'react'

import { Pill, EmptyState, ErrorState } from '@/components/primitives'
import { ChatDrawer } from '@/domains/chat/components/workspace/ChatDrawer'
import { ExecutionLog } from '@/domains/issues/components/issue-detail/execution-log/ExecutionLog'
import { IssueDetailRail } from '@/domains/issues/components/issue-detail/IssueDetailRail'
import { IssueDetailSkeleton } from '@/domains/issues/components/issue-detail/IssueDetailSkeleton'
import { IssueDetailTopbarRight } from '@/domains/issues/components/issue-detail/IssueDetailTopbarRight'
import { IssueFeed } from '@/domains/issues/components/issue-detail/IssueFeed'
import { IssueIntro } from '@/domains/issues/components/issue-detail/IssueIntro'
import { IssueReplyComposer } from '@/domains/issues/components/issue-detail/IssueReplyComposer'
import { RunDrawer } from '@/domains/issues/components/issue-detail/run-drawer'
import { useIssueDetail } from '@/hooks/useIssueDetail'
import { TopbarBackButton } from '@/shell/TopbarBackButton'
import { usePageActions } from '@/shell/usePageActions'
import type { IssueDetailResponse } from '@/types'
import { Copy, FileSearch } from 'lucide-react'

export function IssueDetail({ issueId }: { issueId: string }) {
	const { issue, loading, error, refresh } = useIssueDetail(issueId)

	if (loading) return <IssueDetailSkeleton />
	if (error)
		return (
			<div className="detail__body">
				<div className="detail__inner">
					<ErrorState title="Issue load failed" message={error} onRetry={refresh} />
				</div>
			</div>
		)
	if (!issue)
		return (
			<div className="detail__body">
				<div className="detail__inner">
					<EmptyState
						icon={FileSearch}
						title="Issue not found"
						description="It may have been deleted in Linear or the identifier is wrong."
					/>
				</div>
			</div>
		)

	return <IssueDetailLoaded issue={issue} onRefresh={refresh} />
}

interface IssueDetailLoadedProps {
	issue: IssueDetailResponse
	onRefresh: () => void
}

function IssueDetailLoaded({ issue, onRefresh }: IssueDetailLoadedProps) {
	const sub = useMemo(
		() => (
			<span className="group inline-flex items-center gap-1.5">
				<Pill mono size="xs">
					{issue.identifier}
				</Pill>
				<button
					type="button"
					onClick={() => void navigator.clipboard?.writeText(issue.identifier)}
					className="inline-flex items-center gap-1 rounded px-0.5 text-[11.5px] text-fg-dim opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
					aria-label={`Copy ${issue.identifier} ID`}
				>
					<Copy size={11} strokeWidth={1.8} aria-hidden="true" />
					Copy ID
				</button>
			</span>
		),
		[issue.identifier]
	)

	const isDone = issue.status.state_type === 'completed'
	const right = useMemo(
		() => <IssueDetailTopbarRight issue={issue} isDone={isDone} onRefresh={onRefresh} />,
		[issue, isDone, onRefresh]
	)

	usePageActions({
		title: issue.title,
		crumbs: ['Issues', ...(issue.project ? [issue.project.name] : [])],
		sub,
		right,
		back: <TopbarBackButton />
	})

	return (
		<>
			<div className="detail">
				<div className="detail__body">
					<div className="detail__inner">
						<IssueIntro issue={issue} />
						<div className="section-head">
							<span className="section-head__title">Execution</span>
							<span className="section-head__line" />
						</div>
						<ExecutionLog issue={issue} />
						<div className="section-head">
							<span className="section-head__title">Activity</span>
							<span className="section-head__line" />
						</div>
						<IssueFeed issue={issue} />
						<IssueReplyComposer issueId={issue.id} />
					</div>
				</div>
				<IssueDetailRail issue={issue} />
			</div>
			<ChatDrawer subject={{ kind: 'issue', identifier: issue.identifier }} />
			<RunDrawer />
		</>
	)
}
