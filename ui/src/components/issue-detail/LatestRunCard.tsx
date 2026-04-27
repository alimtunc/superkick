import { RunDurationLabel } from '@/components/issue-detail/RunDurationLabel'
import { RunPrBadge } from '@/components/issue-detail/RunPrBadge'
import { RunStateBadge } from '@/components/RunStateBadge'
import { fmtRelativeTime } from '@/lib/domain'
import type { LinkedRunSummary } from '@/types'
import { Link } from '@tanstack/react-router'

interface LatestRunCardProps {
	run: LinkedRunSummary
}

export function LatestRunCard({ run }: LatestRunCardProps) {
	return (
		<div className="panel mb-3 flex items-center justify-between gap-4 px-4 py-3">
			<div className="flex min-w-0 flex-1 items-center gap-3">
				<RunStateBadge state={run.state} />
				<div className="flex min-w-0 flex-col">
					<span className="font-data text-[12px] text-fog">
						started {fmtRelativeTime(run.started_at)}
					</span>
					<RunDurationLabel startedAt={run.started_at} finishedAt={run.finished_at} />
				</div>
				{run.pr ? <RunPrBadge pr={run.pr} /> : null}
			</div>
			<Link
				to="/runs/$runId"
				params={{ runId: run.id }}
				className="font-data shrink-0 rounded border border-edge px-2 py-1 text-[11px] tracking-wider text-silver uppercase transition-colors hover:border-edge-bright hover:text-fog"
			>
				Open run
			</Link>
		</div>
	)
}
