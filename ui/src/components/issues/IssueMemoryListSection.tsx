import { ContextSection } from '@/components/issues/ContextSection'
import { Button } from '@/components/ui/button'
import { Pill } from '@/components/ui/pill'
import { useIssueMemoryEntries } from '@/hooks/useIssueMemoryEntries'
import { fmtRelativeTime } from '@/lib/domain'
import { formatMemoryAuthor } from '@/lib/issueContext/formatMemoryAuthor'
import { memoryRoleStep } from '@/lib/issueContext/memoryRoleStep'
import { memoryRoleTone } from '@/lib/issueContext/memoryRoleTone'
import { Database } from 'lucide-react'

interface IssueMemoryListSectionProps {
	issueId: string
	omitWhenEmpty?: boolean
}

export function IssueMemoryListSection({ issueId, omitWhenEmpty }: IssueMemoryListSectionProps) {
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
			emptyDescription="Plan, Implement, and Review will append entries here as they run — one per step summary."
			loadingRows={3}
			omitWhenEmpty={omitWhenEmpty}
		>
			<ul className="space-y-2">
				{entries.map((entry) => {
					const step = memoryRoleStep(entry.role)
					return (
						<li
							key={entry.id}
							className="rounded-md border border-edge bg-slate-deep/30 px-2.5 py-2"
						>
							<div className="flex flex-wrap items-center gap-2 text-[12px]">
								<Pill tone={memoryRoleTone(entry.role)} size="xs">
									{entry.role}
								</Pill>
								{step ? (
									<span className="font-data text-[11px] text-fg-dim">{step} step</span>
								) : null}
								<span className="font-medium text-fg">
									{formatMemoryAuthor(entry.author)}
								</span>
								<span className="font-data ml-auto text-[11px] text-fg-dim">
									{fmtRelativeTime(entry.created_at)}
								</span>
							</div>
							<pre className="mt-1.5 font-sans text-[12.5px] leading-relaxed whitespace-pre-wrap text-fg-muted">
								{entry.text}
							</pre>
						</li>
					)
				})}
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
