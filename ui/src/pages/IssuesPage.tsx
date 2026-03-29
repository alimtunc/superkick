import { SectionTitle } from '@/components/dashboard/SectionTitle'
import { IssueRow } from '@/components/issues/IssueRow'
import { IssuesHeader } from '@/components/issues/IssuesHeader'
import { StatusBar } from '@/components/issues/StatusBar'
import { useIssues } from '@/hooks/useIssues'

export function IssuesPage() {
	const { issues, totalCount, loading, error, refresh, statusGroups } = useIssues()

	return (
		<div>
			<IssuesHeader totalCount={totalCount} loading={loading} onRefresh={refresh} />

			<div className="mx-auto flex max-w-5xl flex-col gap-8 px-5 py-8">
				{error ? <p className="font-data text-[11px] text-oxide">{error}</p> : null}

				{loading && issues.length === 0 ? (
					<p className="font-data py-10 text-center text-dim">Loading issues...</p>
				) : null}

				{!loading && issues.length === 0 ? (
					<p className="font-data py-10 text-center text-dim">No issues found.</p>
				) : null}

				{issues.length > 0 ? <StatusBar groups={statusGroups} total={totalCount} /> : null}

				{issues.length > 0 ? (
					<section>
						<SectionTitle title="ISSUES" count={totalCount} />
						<div className="space-y-1">
							{issues.map((issue) => (
								<IssueRow key={issue.id} issue={issue} />
							))}
						</div>
					</section>
				) : null}
			</div>
		</div>
	)
}
