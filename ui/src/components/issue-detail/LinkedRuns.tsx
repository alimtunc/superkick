import { SectionTitle } from '@/components/dashboard/SectionTitle'
import { RunStateBadge } from '@/components/RunStateBadge'
import type { LinkedRunSummary } from '@/types'
import { useNavigate } from '@tanstack/react-router'

export function LinkedRuns({ runs }: { runs: LinkedRunSummary[] }) {
	const navigate = useNavigate()
	const sorted = runs.toSorted(
		(a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
	)

	return (
		<section className="mb-6">
			<SectionTitle title="LINKED RUNS" count={sorted.length} />
			<div className="space-y-2">
				{sorted.map((run) => (
					<div
						key={run.id}
						role="button"
						tabIndex={0}
						onClick={() => navigate({ to: '/runs/$runId', params: { runId: run.id } })}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ')
								navigate({ to: '/runs/$runId', params: { runId: run.id } })
						}}
						className="panel panel-hover flex cursor-pointer items-center justify-between px-4 py-3"
					>
						<div className="flex items-center gap-3">
							<RunStateBadge state={run.state} />
							<span className="font-data text-[11px] text-dim">
								{new Date(run.started_at).toLocaleString()}
							</span>
							{run.pr_url ? (
								<a
									href={run.pr_url}
									target="_blank"
									rel="noopener noreferrer"
									onClick={(e) => e.stopPropagation()}
									className="font-data inline-flex h-5 items-center rounded border border-neon-green/30 bg-neon-green/10 px-1.5 text-[10px] text-neon-green transition-colors hover:border-neon-green/50"
								>
									PR
								</a>
							) : null}
						</div>
						<span className="font-data text-[10px] text-dim">
							{run.finished_at
								? `finished ${new Date(run.finished_at).toLocaleString()}`
								: 'in progress'}
						</span>
					</div>
				))}
			</div>
		</section>
	)
}
