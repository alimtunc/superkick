import { SectionTitle } from '@/components/dashboard/SectionTitle'
import { ChildIssues } from '@/components/issue-detail/ChildIssues'
import { IssueComments } from '@/components/issue-detail/IssueComments'
import { IssueDetailHeader } from '@/components/issue-detail/IssueDetailHeader'
import { IssueMetaGrid } from '@/components/issue-detail/IssueMetaGrid'
import { LinkedRuns } from '@/components/issue-detail/LinkedRuns'
import { useIssueDetail } from '@/hooks/useIssueDetail'

export function IssueDetail({ issueId }: { issueId: string }) {
	const { issue, loading, error, refresh } = useIssueDetail(issueId)

	if (loading) return <p className="font-data p-6 text-dim">Loading...</p>
	if (error) return <p className="font-data p-6 text-oxide">{error}</p>
	if (!issue) return <p className="font-data p-6 text-dim">Issue not found.</p>

	return (
		<div>
			<IssueDetailHeader issue={issue} onRefresh={refresh} />
			<div className="mx-auto max-w-5xl px-5 py-6">
				<IssueMetaGrid issue={issue} />
				{issue.children.length > 0 ? <ChildIssues issues={issue.children} /> : null}
				{issue.linked_runs.length > 0 ? <LinkedRuns runs={issue.linked_runs} /> : null}
				{issue.description ? (
					<section className="mb-6">
						<SectionTitle title="DESCRIPTION" />
						<div className="panel p-4">
							<pre className="font-data text-[12px] leading-relaxed whitespace-pre-wrap text-silver">
								{issue.description}
							</pre>
						</div>
					</section>
				) : null}
				<IssueComments comments={issue.comments} />
			</div>
		</div>
	)
}
