import { isTerminalRunState } from '@/lib/domain/runState'
import type { CommentNode, IssueActivityItem, IssueComment, LinkedRunSummary } from '@/types'

const KIND_ORDINAL: Record<IssueActivityItem['kind'], number> = {
	comment: 0,
	run_launched: 1,
	run_completed: 2
}

export function buildIssueActivity(comments: IssueComment[], runs: LinkedRunSummary[]): IssueActivityItem[] {
	const tree = buildCommentTree(comments)

	const items: IssueActivityItem[] = tree.map((node) => ({
		kind: 'comment',
		node,
		ts: new Date(node.comment.created_at).getTime(),
		key: `comment:${node.comment.id}`
	}))

	for (const run of runs) {
		if (run.state === 'waiting_human') continue
		items.push({
			kind: 'run_launched',
			run,
			ts: new Date(run.started_at).getTime(),
			key: `run-launched:${run.id}`
		})
		if (isTerminalRunState(run.state) && run.finished_at) {
			items.push({
				kind: 'run_completed',
				run,
				ts: new Date(run.finished_at).getTime(),
				key: `run-completed:${run.id}`
			})
		}
	}

	return items.toSorted((a, b) => a.ts - b.ts || KIND_ORDINAL[a.kind] - KIND_ORDINAL[b.kind])
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
