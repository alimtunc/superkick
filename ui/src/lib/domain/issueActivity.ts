import type { CommentNode, IssueComment, LinkedRunSummary } from '@/types'

export type IssueActivityItem =
	| { kind: 'comment'; node: CommentNode; ts: number; key: string }
	| { kind: 'run'; run: LinkedRunSummary; ts: number; key: string }

export function buildIssueActivity(comments: IssueComment[], runs: LinkedRunSummary[]): IssueActivityItem[] {
	const tree = buildCommentTree(comments)

	const commentItems: IssueActivityItem[] = tree.map((node) => ({
		kind: 'comment',
		node,
		ts: new Date(node.comment.created_at).getTime(),
		key: `comment:${node.comment.id}`
	}))

	const runItems: IssueActivityItem[] = runs.map((run) => ({
		kind: 'run',
		run,
		ts: new Date(run.started_at).getTime(),
		key: `run:${run.id}`
	}))

	return [...commentItems, ...runItems].toSorted((a, b) => a.ts - b.ts)
}

function buildCommentTree(comments: IssueComment[]): CommentNode[] {
	const sorted = comments.toSorted(
		(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
	)

	const byId = new Map<string, CommentNode>()
	for (const comment of sorted) {
		byId.set(comment.id, { comment, children: [] })
	}

	const roots: CommentNode[] = []
	for (const comment of sorted) {
		const node = byId.get(comment.id)!
		if (comment.parent_id) {
			const parent = byId.get(comment.parent_id)
			if (parent) {
				parent.children.push(node)
				continue
			}
		}
		roots.push(node)
	}

	return roots
}
