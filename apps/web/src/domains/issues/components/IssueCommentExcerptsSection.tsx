import { ContextSection } from '@/domains/issues/components/ContextSection'
import { useIssueWorkspaceContext } from '@/hooks/useIssueWorkspaceContext'
import { fmtRelativeTime } from '@/lib/domain'
import { MessageSquare } from 'lucide-react'

interface IssueCommentExcerptsSectionProps {
	issueId: string
	omitWhenEmpty?: boolean
}

export function IssueCommentExcerptsSection({ issueId, omitWhenEmpty }: IssueCommentExcerptsSectionProps) {
	const { data, isLoading, isError, error, refetch } = useIssueWorkspaceContext(issueId)
	const excerpts = data?.comment_excerpts ?? []

	return (
		<ContextSection
			ariaLabel="Comment excerpts"
			heading="Comment excerpts"
			isLoading={isLoading}
			error={isError ? (error ?? new Error('Failed to load excerpts.')) : null}
			errorTitle="Comments unavailable"
			errorFallback="Failed to load excerpts."
			onRetry={() => {
				refetch()
			}}
			isEmpty={excerpts.length === 0}
			emptyIcon={MessageSquare}
			emptyTitle="No comment excerpts"
			emptyDescription="Linear comments captured for this issue will appear here so every agent reads the same discussion."
			omitWhenEmpty={omitWhenEmpty}
		>
			<ul className="space-y-2.5">
				{excerpts.map((excerpt) => {
					const authorName = excerpt.author ?? 'Unknown'
					return (
						<li key={excerpt.id} className="min-w-0">
							<div className="flex items-baseline gap-2 text-[12px]">
								<span className="font-medium text-fg">{authorName}</span>
								<span className="font-data text-[11px] text-fg-dim">
									{fmtRelativeTime(excerpt.captured_at)}
								</span>
							</div>
							<pre className="font-sans text-[12.5px] leading-relaxed whitespace-pre-wrap text-fg-muted">
								{excerpt.text}
							</pre>
						</li>
					)
				})}
			</ul>
		</ContextSection>
	)
}
