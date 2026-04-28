import { SectionTitle } from '@/components/dashboard/SectionTitle'
import { ActivityRunEntry } from '@/components/issue-detail/ActivityRunEntry'
import { CommentThread } from '@/components/issue-detail/CommentThread'
import { buildIssueActivity, isTerminalRunState } from '@/lib/domain'
import type { IssueComment, LinkedRunSummary } from '@/types'

interface IssueActivityTimelineProps {
	comments: IssueComment[]
	runs: LinkedRunSummary[]
}

export function IssueActivityTimeline({ comments, runs }: IssueActivityTimelineProps) {
	const terminalRuns = runs.filter((run) => isTerminalRunState(run.state))
	const total = comments.length + terminalRuns.length
	if (total === 0) return null

	const items = buildIssueActivity(comments, terminalRuns)

	return (
		<section className="mb-6">
			<SectionTitle title="ACTIVITY" count={total} />
			<div className="space-y-3">
				{items.map((item) =>
					item.kind === 'comment' ? (
						<CommentThread key={item.key} node={item.node} isRoot />
					) : (
						<div key={item.key} className="rounded-md border border-edge bg-graphite">
							<ActivityRunEntry run={item.run} />
						</div>
					)
				)}
			</div>
		</section>
	)
}
