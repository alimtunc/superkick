import { RunDurationLabel } from '@/components/issue-detail/RunDurationLabel'
import { RunPrBadge } from '@/components/issue-detail/RunPrBadge'
import { RunStateBadge } from '@/components/RunStateBadge'
import { fmtRelativeTime } from '@/lib/domain'
import type { LinkedRunSummary } from '@/types'
import { Link } from '@tanstack/react-router'

export function ActivityRunEntry({ run }: { run: LinkedRunSummary }) {
	return (
		<div className="flex items-center gap-3 px-4 py-3">
			<RunStateBadge state={run.state} />
			<div className="flex min-w-0 flex-1 items-baseline gap-2">
				<span className="font-data text-[11px] text-fog">
					started {fmtRelativeTime(run.started_at)}
				</span>
				<RunDurationLabel startedAt={run.started_at} finishedAt={run.finished_at} />
			</div>
			{run.pr ? <RunPrBadge pr={run.pr} className="shrink-0" /> : null}
			<Link
				to="/runs/$runId"
				params={{ runId: run.id }}
				className="font-data shrink-0 rounded border border-edge px-2 py-0.5 text-[10px] tracking-wider text-silver uppercase transition-colors hover:border-edge-bright hover:text-fog"
			>
				Open run
			</Link>
		</div>
	)
}
