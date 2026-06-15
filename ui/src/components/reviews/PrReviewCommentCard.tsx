import { AgentPill } from '@/components/issue-detail/AgentPill'
import { AuthorAvatar } from '@/components/issue-detail/AuthorAvatar'
import { IssueMarkdown } from '@/components/issue-detail/IssueMarkdown'
import { fmtRelativeTime, isAgentName } from '@/lib/domain'
import type { GithubReviewDecision } from '@/types'

interface PrReviewCommentCardProps {
	actor: string
	body: string
	createdAt: string
	decision?: GithubReviewDecision | null
	filePath?: string | null
}

const DECISION_LABEL: Partial<Record<GithubReviewDecision, string>> = {
	approved: 'approved',
	changes_requested: 'requested changes',
	commented: 'commented'
}

export function PrReviewCommentCard({
	actor,
	body,
	createdAt,
	decision,
	filePath
}: PrReviewCommentCardProps) {
	const isAgent = isAgentName(actor)
	const decisionLabel = decision ? DECISION_LABEL[decision] : undefined
	return (
		<div className="feeditem">
			<div className="feeditem__node">
				<AuthorAvatar name={actor} avatarUrl={null} size={22} />
			</div>
			<div className="comment-card">
				<div className="comment-card__head">
					<span className="comment-card__author">{actor}</span>
					{isAgent ? <AgentPill /> : null}
					<span className="comment-card__ts">
						{decisionLabel ? `${decisionLabel} · ` : ''}
						{fmtRelativeTime(createdAt)}
					</span>
				</div>
				{filePath ? (
					<p className="mono mb-1.5 truncate text-[11px] text-fg-dim" title={filePath}>
						{filePath}
					</p>
				) : null}
				<div className="comment-card__body">
					<IssueMarkdown text={body} bare />
				</div>
			</div>
		</div>
	)
}
