import { IssueMarkdown } from '@/domains/issues/components/issue-detail/IssueMarkdown'
import { sanitizeGithubMarkdown } from '@/lib/markdown'

interface PrDescriptionProps {
	body: string
}

export function PrDescription({ body }: PrDescriptionProps) {
	const text = sanitizeGithubMarkdown(body)
	if (!text) {
		return null
	}
	return (
		<section aria-label="Description" className="md mb-5 border-b border-(--border-faint) pb-5">
			<IssueMarkdown text={text} bare />
		</section>
	)
}
