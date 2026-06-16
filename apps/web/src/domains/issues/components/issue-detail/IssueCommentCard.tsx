import { Icon } from '@/components/primitives'
import { AgentPill } from '@/domains/issues/components/issue-detail/AgentPill'
import { AuthorAvatar } from '@/domains/issues/components/issue-detail/AuthorAvatar'
import { IssueMarkdown } from '@/domains/issues/components/issue-detail/IssueMarkdown'
import { fmtRelativeTime, isAgentName } from '@/lib/domain'
import { FEATURES } from '@/lib/features'
import type { CommentNode } from '@/types'

function CommentReply({ node }: { node: CommentNode }) {
	const name = node.comment.author?.name ?? 'Unknown'
	return (
		<div className="reply">
			<div className="reply__node">
				<AuthorAvatar name={name} avatarUrl={node.comment.author?.avatar_url ?? null} size={16} />
			</div>
			<div className="comment-card">
				<div className="comment-card__head">
					<span className="comment-card__author">{name}</span>
					<span className="comment-card__ts">{fmtRelativeTime(node.comment.created_at)}</span>
				</div>
				<div className="comment-card__body">
					<IssueMarkdown text={node.comment.body} bare />
				</div>
			</div>
		</div>
	)
}

export function IssueCommentCard({ node }: { node: CommentNode }) {
	const name = node.comment.author?.name ?? 'Unknown'
	const isAgent = isAgentName(name)
	const showReplies = FEATURES.commentThreads && node.children.length > 0
	return (
		<div className="feeditem">
			<div className="feeditem__node">
				<AuthorAvatar name={name} avatarUrl={node.comment.author?.avatar_url ?? null} size={22} />
			</div>
			<div className="comment-card">
				<div className="comment-card__head">
					<span className="comment-card__author">{name}</span>
					{isAgent ? <AgentPill /> : null}
					<span className="comment-card__ts">· {fmtRelativeTime(node.comment.created_at)}</span>
					<button
						type="button"
						aria-label="Comment actions"
						className="iconbtn"
						style={{ marginLeft: 'auto', width: 22, height: 22 }}
					>
						<Icon name="more" size={13} className="ic" />
					</button>
				</div>
				<div className="comment-card__body">
					<IssueMarkdown text={node.comment.body} bare />
				</div>
			</div>
			{showReplies ? (
				<div className="comment-replies">
					{node.children.map((child) => (
						<CommentReply key={child.comment.id} node={child} />
					))}
				</div>
			) : null}
		</div>
	)
}
