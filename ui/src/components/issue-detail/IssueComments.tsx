import { SectionTitle } from '@/components/dashboard/SectionTitle'
import { AuthorAvatar } from '@/components/issue-detail/AuthorAvatar'
import { fmtRelativeTime } from '@/lib/domain'
import type { IssueComment } from '@/types'

interface CommentNode {
	comment: IssueComment
	children: CommentNode[]
}

function buildCommentTree(comments: IssueComment[]): CommentNode[] {
	const sorted = comments.toSorted(
		(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
	)

	const byId = new Map<string, CommentNode>()
	const roots: CommentNode[] = []

	for (const c of sorted) {
		byId.set(c.id, { comment: c, children: [] })
	}

	for (const c of sorted) {
		const node = byId.get(c.id)!
		if (c.parent_id) {
			const parent = byId.get(c.parent_id)
			if (parent) {
				parent.children.push(node)
			} else {
				roots.push(node)
			}
		} else {
			roots.push(node)
		}
	}

	return roots
}

export function IssueComments({ comments }: { comments: IssueComment[] }) {
	if (comments.length === 0) return null

	const tree = buildCommentTree(comments)

	return (
		<section className="mb-6">
			<SectionTitle title="COMMENTS" count={comments.length} />
			<div className="space-y-3">
				{tree.map((node) => (
					<CommentThread key={node.comment.id} node={node} isRoot />
				))}
			</div>
		</section>
	)
}

function CommentThread({ node, isRoot }: { node: CommentNode; isRoot?: boolean }) {
	return (
		<div className={isRoot ? 'panel' : ''}>
			<CommentRow comment={node.comment} />
			{node.children.length > 0 ? (
				<div className="ml-10 border-l border-edge">
					{node.children.map((child) => (
						<CommentThread key={child.comment.id} node={child} />
					))}
				</div>
			) : null}
		</div>
	)
}

function CommentRow({ comment }: { comment: IssueComment }) {
	const name = comment.author?.name ?? 'Unknown'

	return (
		<div className="flex gap-3 px-4 py-3">
			<AuthorAvatar name={name} avatarUrl={comment.author?.avatar_url ?? null} />
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline gap-2">
					<span className="font-data text-[11px] font-medium text-silver">{name}</span>
					<span className="font-data text-[10px] text-dim">
						{fmtRelativeTime(comment.created_at)}
					</span>
				</div>
				<pre className="font-data mt-1 text-[12px] leading-relaxed whitespace-pre-wrap text-silver/80">
					{comment.body}
				</pre>
			</div>
		</div>
	)
}
