import { AgentPill } from '@/components/issue-detail/AgentPill'
import { AuthorAvatar } from '@/components/issue-detail/AuthorAvatar'
import { IssueMarkdown } from '@/components/issue-detail/IssueMarkdown'
import { fmtRelativeTime, isAgentName } from '@/lib/domain'
import { FEATURES } from '@/lib/features'
import type { CommentNode } from '@/types'
import { Icon } from '@/ui'

function CommentReply({ node }: { node: CommentNode }) {
	const name = node.comment.author?.name ?? 'Unknown'
	return (
		<div className="flex gap-2.5">
			<AuthorAvatar name={name} avatarUrl={node.comment.author?.avatar_url ?? null} size={20} />
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline gap-2 text-[12px]">
					<span className="font-medium text-fg">{name}</span>
					<span className="font-data text-[11px] text-fg-dim">
						{fmtRelativeTime(node.comment.created_at)}
					</span>
				</div>
				<IssueMarkdown text={node.comment.body} compact className="mt-1 text-[13px]" />
			</div>
		</div>
	)
}

export function IssueCommentCard({ node, isLast = false }: { node: CommentNode; isLast?: boolean }) {
	const name = node.comment.author?.name ?? 'Unknown'
	const isAgent = isAgentName(name)
	const showReplies = FEATURES.commentThreads && node.children.length > 0
	return (
		<div className="flex gap-2.5">
			<div className="flex flex-col items-center">
				<AuthorAvatar name={name} avatarUrl={node.comment.author?.avatar_url ?? null} />
				{isLast ? null : <span className="mt-1 w-px grow bg-border" aria-hidden="true" />}
			</div>
			<div className={`min-w-0 flex-1 ${isLast ? '' : 'pb-4'}`}>
				<div className="rounded-[8px] border border-border bg-surface">
					<div className="flex items-center gap-1.75 px-3 pt-1.75 pb-1.25">
						<span className="text-[12.5px] font-medium text-fg">{name}</span>
						{isAgent ? <AgentPill /> : null}
						<span className="text-[11px] text-fg-dim">
							· {fmtRelativeTime(node.comment.created_at)}
						</span>
						<button
							type="button"
							aria-label="Comment actions"
							className="ml-auto inline-flex size-5 items-center justify-center rounded text-fg-dim transition-colors hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
						>
							<Icon name="more" size={13} />
						</button>
					</div>
					<div className="px-3 pb-2.5 text-[13px] leading-[1.55] text-fg">
						<IssueMarkdown text={node.comment.body} compact />
						{showReplies ? (
							<div className="mt-3 space-y-3 border-l border-border pl-3.5">
								{node.children.map((child) => (
									<CommentReply key={child.comment.id} node={child} />
								))}
							</div>
						) : null}
					</div>
				</div>
			</div>
		</div>
	)
}
