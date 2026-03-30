import { CommentRow } from '@/components/issue-detail/CommentRow'
import type { CommentNode } from '@/components/issue-detail/IssueComments'

export function CommentThread({ node, isRoot }: { node: CommentNode; isRoot?: boolean }) {
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
