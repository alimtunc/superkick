import { ContextSection } from '@/components/issues/ContextSection'
import { Button } from '@/components/ui/button'
import { Pill } from '@/components/ui/pill'
import { useIssueMemoryEntries } from '@/hooks/useIssueMemoryEntries'
import { fmtRelativeTime } from '@/lib/domain'
import { formatMemoryAuthor } from '@/lib/issueContext/formatMemoryAuthor'
import { memoryRoleTone } from '@/lib/issueContext/memoryRoleTone'
import { Database } from 'lucide-react'

interface IssueMemoryListSectionProps {
	issueId: string
}

export function IssueMemoryListSection({ issueId }: IssueMemoryListSectionProps) {
	const { entries, isLoading, isError, error, hasNextPage, isFetchingNextPage, fetchNextPage, refetch } =
		useIssueMemoryEntries(issueId)

	return (
		<ContextSection
			ariaLabel="Memory entries"
			heading="Memory"
			isLoading={isLoading}
			error={isError ? (error ?? new Error('Failed to load memory entries.')) : null}
			errorTitle="Memory unavailable"
			errorFallback="Failed to load memory entries."
			onRetry={() => {
				refetch()
			}}
			isEmpty={entries.length === 0}
			emptyIcon={Database}
			emptyTitle="Memory empty"
			emptyDescription="Pending SUP-148: no memory entries have been written for this issue yet."
			loadingRows={3}
		>
			<ul className="space-y-2">
				{entries.map((entry) => (
					<li key={entry.id} className="rounded-md border border-edge bg-slate-deep/30 px-2.5 py-2">
						<div className="flex flex-wrap items-center gap-2 text-[12px]">
							<Pill tone={memoryRoleTone(entry.role)} size="xs">
								{entry.role}
							</Pill>
							<span className="font-medium text-fg">{formatMemoryAuthor(entry.author)}</span>
							<span className="font-data ml-auto text-[11px] text-fg-dim">
								{fmtRelativeTime(entry.created_at)}
							</span>
						</div>
						<pre className="mt-1.5 font-sans text-[12.5px] leading-relaxed whitespace-pre-wrap text-fg-muted">
							{entry.text}
						</pre>
					</li>
				))}
			</ul>
			{hasNextPage ? (
				<div className="mt-2.5 flex justify-center">
					<Button
						variant="outline"
						size="xs"
						onClick={() => {
							fetchNextPage()
						}}
						disabled={isFetchingNextPage}
					>
						{isFetchingNextPage ? 'Loading…' : 'Load more'}
					</Button>
				</div>
			) : null}
		</ContextSection>
	)
}
