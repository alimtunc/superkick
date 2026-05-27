import { EditableDescription } from '@/components/issue-detail/properties/EditableDescription'
import type { IssueDetailResponse } from '@/types'

interface IssueDescriptionProps {
	issue: IssueDetailResponse
}

export function IssueDescription({ issue }: IssueDescriptionProps) {
	return <EditableDescription issue={issue} />
}
