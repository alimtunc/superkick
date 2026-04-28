import { ChildIssues } from '@/components/issue-detail/ChildIssues'
import { IssueActivityTimeline } from '@/components/issue-detail/IssueActivityTimeline'
import { IssueDescription } from '@/components/issue-detail/IssueDescription'
import { IssueDetailHeader } from '@/components/issue-detail/IssueDetailHeader'
import { IssueLauncherPanel } from '@/components/issue-detail/IssueLauncherPanel'
import { IssuePropertiesPanel } from '@/components/issue-detail/IssuePropertiesPanel'
import { NeedsHumanBanner } from '@/components/issue-detail/NeedsHumanBanner'
import { EmptyState } from '@/components/ui/state-empty'
import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
import { useIssueDetail } from '@/hooks/useIssueDetail'
import { FileSearch } from 'lucide-react'

export function IssueDetail({ issueId }: { issueId: string }) {
	const { issue, loading, error, refresh } = useIssueDetail(issueId)

	if (loading)
		return (
			<div className="mx-auto max-w-5xl px-5 py-6">
				<LoadingState rows={4} />
			</div>
		)
	if (error)
		return (
			<div className="mx-auto max-w-5xl px-5 py-6">
				<ErrorState title="Issue load failed" message={error} onRetry={refresh} />
			</div>
		)
	if (!issue)
		return (
			<div className="mx-auto max-w-5xl px-5 py-6">
				<EmptyState
					icon={FileSearch}
					title="Issue not found"
					description="It may have been deleted in Linear or the identifier is wrong."
				/>
			</div>
		)

	return (
		<div>
			<IssueDetailHeader issue={issue} onRefresh={refresh} />
			<div className="mx-auto max-w-5xl px-5 py-6">
				<NeedsHumanBanner runs={issue.linked_runs} />
				<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
					<main className="min-w-0">
						<h1 className="font-data mb-5 text-[20px] leading-tight font-semibold text-fog">
							{issue.title}
						</h1>
						<IssueDescription description={issue.description} />
						{issue.children.length > 0 ? <ChildIssues issues={issue.children} /> : null}
						<IssueLauncherPanel issue={issue} />
						<IssueActivityTimeline comments={issue.comments} runs={issue.linked_runs} />
					</main>
					<IssuePropertiesPanel issue={issue} />
				</div>
			</div>
		</div>
	)
}
