import { IssueMarkdown } from '@/components/issue-detail/IssueMarkdown'

export function IssueDescription({ description }: { description: string }) {
	if (!description.trim()) return null

	return <IssueMarkdown text={description} className="text-[14px] leading-7" />
}
