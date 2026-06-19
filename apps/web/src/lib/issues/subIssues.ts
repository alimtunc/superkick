import type { IssueChildRef } from '@/types'

export interface SubIssueCount {
	done: number
	total: number
}

export function subIssueCount(children: IssueChildRef[]): SubIssueCount {
	const done = children.filter((child) => child.status.state_type === 'completed').length
	return { done, total: children.length }
}
