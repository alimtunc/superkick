import { CommentRow } from '@/components/issue-detail/CommentRow'
import type { CommentNode } from '@/types'

export function CommentThread({ node, isRoot }: { node: CommentNode; isRoot?: boolean }) {
	return (
		<div className={isRoot ? 'rounded-md border border-edge bg-graphite' : ''}>
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
