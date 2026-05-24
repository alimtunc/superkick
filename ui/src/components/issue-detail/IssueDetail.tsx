import { useMemo } from 'react'

import { IssueDetailRail } from '@/components/issue-detail/IssueDetailRail'
import { IssueFeed } from '@/components/issue-detail/IssueFeed'
import { IssueReplyComposer } from '@/components/issue-detail/IssueReplyComposer'
import { RunDrawer } from '@/components/issue-detail/run-drawer'
import { Pill } from '@/components/ui/pill'
import { EmptyState } from '@/components/ui/state-empty'
import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
import { ChatDrawer } from '@/components/workspace/ChatDrawer'
import { useIssueDetail } from '@/hooks/useIssueDetail'
import { TopbarBackButton } from '@/shell/TopbarBackButton'
import { usePageActions } from '@/shell/usePageActions'
import type { IssueDetailResponse } from '@/types'
import { Btn } from '@/ui/Btn'
import { useNavigate } from '@tanstack/react-router'
import { Copy, FileSearch, RefreshCw, Zap } from 'lucide-react'

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
	const projectName = issue.project?.name ?? 'No project'

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

	const right = useMemo(
		() => (
			<>
				<button
					type="button"
					onClick={onRefresh}
					aria-label="Refresh issue data"
					title="Refresh issue data"
					className="inline-flex size-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
				>
					<RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
				</button>
				<div className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
				<Btn
					kind="primary"
					size="sm"
					onClick={() => navigate({ to: '/tasks/new', search: { issue: issue.identifier } })}
					aria-label={`Launch task for ${issue.identifier}`}
				>
					<Zap size={14} strokeWidth={1.85} aria-hidden="true" />
					Launch task
				</Btn>
			</>
		),
		[issue.identifier, navigate, onRefresh]
	)

	usePageActions({
		title: issue.title,
		crumbs: ['Issues', projectName, issue.status.name],
		sub,
		right,
		back: <TopbarBackButton />
	})

	return (
		<>
			<div className="flex h-full min-h-0 bg-canvas">
				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
					<div className="mx-auto w-full max-w-180 px-6 py-6">
						<IssueFeed issue={issue} />
						<div className="mt-5">
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
