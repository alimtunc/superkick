import { ContextSection } from '@/components/issues/ContextSection'
import { Pill } from '@/components/ui/pill'
import { useIssueWorkspaceContext } from '@/hooks/useIssueWorkspaceContext'
import { fmtRelativeTime } from '@/lib/domain'
import { FileSearch } from 'lucide-react'

interface IssueSnapshotSectionProps {
	issueId: string
}

export function IssueSnapshotSection({ issueId }: IssueSnapshotSectionProps) {
	const { data, isLoading, isError, error, refetch } = useIssueWorkspaceContext(issueId)
	const snapshot = data?.snapshot
	const description = snapshot?.description.trim() ?? ''

	return (
		<ContextSection
			ariaLabel="Issue snapshot"
			heading="Snapshot"
			isLoading={isLoading}
			error={isError ? (error ?? new Error('Failed to load issue snapshot.')) : null}
			errorTitle="Snapshot unavailable"
			errorFallback="Failed to load issue snapshot."
			onRetry={() => {
				refetch()
			}}
			isEmpty={!snapshot}
			emptyIcon={FileSearch}
			emptyTitle="No snapshot yet"
			emptyDescription="This issue has not been attached to a workspace context."
		>
			{snapshot ? (
				<>
					<div className="flex flex-wrap items-center gap-2">
						<Pill mono size="xs">
							{snapshot.identifier}
						</Pill>
						<Pill tone="neutral" size="xs" style={{ color: snapshot.status.color }}>
							{snapshot.status.name}
						</Pill>
						<span className="font-data text-[11px] text-fg-dim">
							captured {fmtRelativeTime(snapshot.captured_at)}
						</span>
					</div>
					<p className="mt-2 text-[13px] leading-relaxed font-medium text-fg">{snapshot.title}</p>
					{description ? (
						<pre className="mt-1.5 max-h-40 overflow-y-auto font-sans text-[12.5px] leading-relaxed whitespace-pre-wrap text-fg-muted">
							{description}
						</pre>
					) : (
						<p className="mt-1.5 text-[12px] text-fg-dim italic">No description captured.</p>
					)}
				</>
			) : null}
		</ContextSection>
	)
}
