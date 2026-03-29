import { SectionTitle } from '@/components/dashboard/SectionTitle'
import { IssueFilters } from '@/components/issues/IssueFilters'
import { IssueRow } from '@/components/issues/IssueRow'
import { IssuesHeader } from '@/components/issues/IssuesHeader'
import { StatusBar } from '@/components/issues/StatusBar'
import { useIssues } from '@/hooks/useIssues'
import { BUCKET_META } from '@/lib/domain/classifyIssues'

export function IssuesPage() {
	const {
		allIssues,
		filteredIssues,
		classified,
		activeBucket,
		setActiveBucket,
		totalCount,
		loading,
		error,
		refresh
	} = useIssues()

	const bucketLabel = BUCKET_META[activeBucket].label

	return (
		<div>
			<IssuesHeader totalCount={totalCount} loading={loading} onRefresh={refresh} />

			<div className="mx-auto flex max-w-5xl flex-col gap-8 px-5 py-8">
				{error ? <p className="font-data text-[11px] text-oxide">{error}</p> : null}

				{loading && allIssues.length === 0 ? (
					<p className="font-data py-10 text-center text-dim">Loading issues...</p>
				) : null}

				{!loading && allIssues.length === 0 ? (
					<p className="font-data py-10 text-center text-dim">No issues found.</p>
				) : null}

				{allIssues.length > 0 ? (
					<>
						<StatusBar classified={classified} total={totalCount} />

						<IssueFilters
							activeBucket={activeBucket}
							classified={classified}
							onSelect={setActiveBucket}
						/>

						<section>
							<SectionTitle title={bucketLabel} count={filteredIssues.length} />
							{filteredIssues.length > 0 ? (
								<div className="space-y-1">
									{filteredIssues.map((issue) => (
										<IssueRow key={issue.id} issue={issue} />
									))}
								</div>
							) : (
								<p className="font-data py-6 text-center text-[11px] text-dim">
									No {bucketLabel.toLowerCase()} issues.
								</p>
							)}
						</section>
					</>
				) : null}
			</div>
		</div>
	)
}
