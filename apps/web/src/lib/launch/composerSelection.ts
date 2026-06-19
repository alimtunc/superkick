import type { IssueChipPickerValue, IssueDetailResponse, LinearIssueListItem } from '@/types'

export function selectionFromDetail(issue: IssueDetailResponse | null): IssueChipPickerValue | null {
	if (!issue) return null
	return { id: issue.id, identifier: issue.identifier, title: issue.title }
}

export function selectionFromListItem(item: LinearIssueListItem): IssueChipPickerValue {
	return { id: item.id, identifier: item.identifier, title: item.title }
}

export function bodyFromIssue(issue: IssueDetailResponse | null): string {
	if (!issue) return ''
	const description = issue.description?.trim()
	if (description) return description
	return issue.title
}
