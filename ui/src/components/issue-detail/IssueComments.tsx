import { SectionTitle } from '@/components/dashboard/SectionTitle'
import { CommentThread } from '@/components/issue-detail/CommentThread'
import type { IssueComment } from '@/types'

export interface CommentNode {
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
