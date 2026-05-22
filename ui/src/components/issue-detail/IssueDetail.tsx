import { useMemo } from 'react'

import { IssueDetailRail } from '@/components/issue-detail/IssueDetailRail'
import { IssueFeed } from '@/components/issue-detail/IssueFeed'
import { IssueReplyComposer } from '@/components/issue-detail/IssueReplyComposer'
import { RunDrawer } from '@/components/issue-detail/run-drawer'
import { StatusChip } from '@/components/issue-detail/StatusChip'
import { Pill } from '@/components/ui/pill'
import { EmptyState } from '@/components/ui/state-empty'
import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
import { ChatDrawer } from '@/components/workspace/ChatDrawer'
import { ChatToggleButton } from '@/components/workspace/ChatToggleButton'
import { useIssueDetail } from '@/hooks/useIssueDetail'
import { isActiveRun } from '@/lib/domain'
import { TopbarBackButton } from '@/shell/TopbarBackButton'
import { usePageActions } from '@/shell/usePageActions'
import type { IssueDetailResponse } from '@/types'
import { Btn } from '@/ui/Btn'
import { Link, useNavigate } from '@tanstack/react-router'
import { ExternalLink, FileSearch, RefreshCw, Zap } from 'lucide-react'

export function IssueDetail({ issueId }: { issueId: string }) {
	const { issue, loading, error, refresh } = useIssueDetail(issueId)

	if (loading)
		return (
			<div className="p-6">
				<LoadingState rows={4} />
			</div>
		)
	if (error)
		return (
			<div className="p-6">
				<ErrorState title="Issue load failed" message={error} onRetry={refresh} />
			</div>
		)
	if (!issue)
		return (
			<div className="p-6">
				<EmptyState
					icon={FileSearch}
					title="Issue not found"
					description="It may have been deleted in Linear or the identifier is wrong."
				/>
			</div>
		)

	return <IssueDetailLoaded issue={issue} onRefresh={refresh} />
}

interface IssueDetailLoadedProps {
	issue: IssueDetailResponse
	onRefresh: () => void
}

function IssueDetailLoaded({ issue, onRefresh }: IssueDetailLoadedProps) {
	const navigate = useNavigate()
	const activeRun = issue.linked_runs.find(isActiveRun)

	const sub = useMemo(
		() => (
			<>
				<Pill mono size="xs">
					{issue.identifier}
				</Pill>
				<StatusChip status={issue.status} />
				{activeRun ? (
					<Link
						to="/runs/$runId"
						params={{ runId: activeRun.id }}
						className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
					>
						<Pill tone="live" size="xs" dot pulse>
							Active run
						</Pill>
					</Link>
				) : null}
			</>
		),
		[issue.identifier, issue.status, activeRun]
	)

	const right = useMemo(
		() => (
			<>
				<ChatToggleButton />
				<a
					href={issue.url}
					target="_blank"
					rel="noopener noreferrer"
					aria-label="Open in Linear"
					title="Open in Linear"
					className="inline-flex size-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
				>
					<ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
				</a>
				<button
					type="button"
					onClick={onRefresh}
					aria-label="Refresh issue data"
					title="Refresh issue data"
					className="inline-flex size-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
				>
					<RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
				</button>
				<Btn
					kind="primary"
					size="sm"
					iconRight="arrowRight"
					onClick={() => navigate({ to: '/tasks/new', search: { issue: issue.identifier } })}
					aria-label={`Launch task for ${issue.identifier}`}
				>
					<Zap size={14} strokeWidth={1.85} aria-hidden="true" />
					Launch task…
				</Btn>
			</>
		),
		[issue.identifier, issue.url, onRefresh, navigate]
	)

	usePageActions({
		title: issue.title,
		sub,
		right,
		back: <TopbarBackButton />
	})

	return (
		<>
			<div className="flex h-full min-h-0">
				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
					<div className="mx-auto w-full max-w-3xl p-6">
						<IssueFeed issue={issue} />
						<div className="mt-2">
							<IssueReplyComposer />
						</div>
					</div>
				</div>
				<IssueDetailRail issue={issue} />
			</div>
			<ChatDrawer subject={{ kind: 'issue', identifier: issue.identifier }} />
			<RunDrawer />
		</>
	)
}
