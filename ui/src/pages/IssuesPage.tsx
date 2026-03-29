import { Button } from '@/components/ui/button'
import { useIssues } from '@/hooks/useIssues'
import type { LinearIssueListItem } from '@/types'
import { Link } from '@tanstack/react-router'

export function IssuesPage() {
	const { issues, totalCount, loading, error, refresh } = useIssues()

	return (
		<div>
			<header className="sticky top-0 z-50 border-b border-edge bg-carbon/90 backdrop-blur-md">
				<div className="mx-auto flex h-12 max-w-4xl items-center justify-between px-5">
					<div className="flex items-center gap-3">
						<Link
							to="/"
							className="font-data text-[11px] text-dim transition-colors hover:text-silver"
						>
							&larr; CONTROL CENTER
						</Link>
						<span className="text-edge">|</span>
						<span className="font-data text-[11px] font-medium text-fog">ISSUES</span>
						<span className="font-data text-[10px] text-dim">{totalCount}</span>
					</div>
					<Button
						variant="outline"
						size="xs"
						onClick={() => refresh()}
						className="font-data text-[11px] text-dim hover:text-silver"
					>
						REFRESH
					</Button>
				</div>
			</header>

			<div className="mx-auto max-w-4xl px-5 py-6">
				{loading ? <p className="font-data text-dim">Loading...</p> : null}
				{error ? <p className="font-data text-oxide">{error}</p> : null}
				{!loading && issues.length === 0 ? (
					<p className="font-data text-dim">No issues found.</p>
				) : null}

				<div className="space-y-1">
					{issues.map((issue) => (
						<IssueRow key={issue.id} issue={issue} />
					))}
				</div>
			</div>
		</div>
	)
}

function IssueRow({ issue }: { issue: LinearIssueListItem }) {
	return (
		<Link
			to="/issues/$issueId"
			params={{ issueId: issue.id }}
			className="panel panel-hover flex items-center gap-4 px-4 py-3"
		>
			<span className="font-data w-16 shrink-0 text-[11px] font-medium text-fog">
				{issue.identifier}
			</span>

			<span
				className="inline-block w-20 shrink-0 rounded px-2 py-0.5 text-center text-[10px] font-medium"
				style={{
					color: issue.status.color,
					backgroundColor: `${issue.status.color}15`
				}}
			>
				{issue.status.name}
			</span>

			<span className="font-data min-w-0 flex-1 truncate text-[12px] text-silver">{issue.title}</span>

			<span className="font-data shrink-0 text-[10px] text-dim">{issue.priority.label}</span>

			{issue.assignee ? (
				<span className="font-data shrink-0 text-[10px] text-dim">{issue.assignee.name}</span>
			) : null}
		</Link>
	)
}
