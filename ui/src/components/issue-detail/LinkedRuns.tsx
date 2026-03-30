import { SectionTitle } from '@/components/dashboard/SectionTitle'
import { RunStateBadge } from '@/components/RunStateBadge'
import type { LinkedRunSummary } from '@/types'
import { Link } from '@tanstack/react-router'

export function LinkedRuns({ runs }: { runs: LinkedRunSummary[] }) {
	const sorted = runs.toSorted(
		(a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
	)

	return (
		<section className="mb-6">
			<SectionTitle title="LINKED RUNS" count={sorted.length} />
			<div className="space-y-2">
				{sorted.map((run) => (
					<Link
						key={run.id}
						to="/runs/$runId"
						params={{ runId: run.id }}
						className="panel panel-hover flex items-center justify-between px-4 py-3"
					>
						<div className="flex items-center gap-3">
							<RunStateBadge state={run.state} />
							<span className="font-data text-[11px] text-dim">
								{new Date(run.started_at).toLocaleString()}
							</span>
						</div>
						<span className="font-data text-[10px] text-dim">
							{run.finished_at
								? `finished ${new Date(run.finished_at).toLocaleString()}`
								: 'in progress'}
						</span>
					</Link>
				))}
			</div>
		</section>
	)
}
