import { ChildIssues } from '@/components/issue-detail/ChildIssues'
import { IssueActivityTimeline } from '@/components/issue-detail/IssueActivityTimeline'
import { IssueDescription } from '@/components/issue-detail/IssueDescription'
import { IssueDetailHeader } from '@/components/issue-detail/IssueDetailHeader'
import { IssueLauncherPanel } from '@/components/issue-detail/IssueLauncherPanel'
import { IssuePropertiesPanel } from '@/components/issue-detail/IssuePropertiesPanel'
import { IssueTerminalEntry } from '@/components/issue-detail/IssueTerminalEntry'
import { LaunchTaskFeed } from '@/components/issue-detail/launch-task-feed'
import { NeedsHumanBanner } from '@/components/issue-detail/NeedsHumanBanner'
import { DetailShell } from '@/components/ui/detail-shell'
import { EmptyState } from '@/components/ui/state-empty'
import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
import { ChatDrawer } from '@/components/workspace/ChatDrawer'
import { useIssueDetail } from '@/hooks/useIssueDetail'
import { pickLatestRun } from '@/lib/domain'
import { FileSearch } from 'lucide-react'

export function IssueDetail({ issueId }: { issueId: string }) {
	const { issue, loading, error, refresh } = useIssueDetail(issueId)

	if (loading)
		return (
			<DetailShell>
				<LoadingState rows={4} />
			</DetailShell>
		)
	if (error)
		return (
			<DetailShell>
				<ErrorState title="Issue load failed" message={error} onRetry={refresh} />
			</DetailShell>
		)
	if (!issue)
		return (
			<DetailShell>
				<EmptyState
					icon={FileSearch}
					title="Issue not found"
					description="It may have been deleted in Linear or the identifier is wrong."
				/>
			</DetailShell>
		)

	const latestRun = pickLatestRun(issue.linked_runs)

	return (
		<div>
			<IssueDetailHeader issue={issue} onRefresh={refresh} />
			<DetailShell>
				<NeedsHumanBanner runs={issue.linked_runs} />
				<h1 className="font-data mb-5 text-[20px] leading-tight font-semibold text-fog">
					{issue.title}
				</h1>
				<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
					<div className="min-w-0 space-y-6">
						<LaunchTaskFeed issueIdentifier={issue.identifier} />
						<IssueDescription description={issue.description} />
						{issue.children.length > 0 ? <ChildIssues issues={issue.children} /> : null}
						<IssueActivityTimeline comments={issue.comments} runs={issue.linked_runs} />
					</div>
					<aside className="space-y-5">
						<IssuePropertiesPanel issue={issue} />
						<IssueLauncherPanel issue={issue} />
						<IssueTerminalEntry latestRun={latestRun} />
					</aside>
				</div>
			</DetailShell>
			<ChatDrawer subject={{ kind: 'issue', identifier: issue.identifier }} />
		</div>
	)
}
