import { OpenRunPill } from '@/components/issue-detail/OpenRunPill'
import { RunDurationLabel } from '@/components/issue-detail/RunDurationLabel'
import { RunPrBadge } from '@/components/issue-detail/RunPrBadge'
import { RunStateBadge } from '@/components/RunStateBadge'
import { fmtRelativeTime } from '@/lib/domain'
import type { LinkedRunSummary } from '@/types'

interface LatestRunCardProps {
	run: LinkedRunSummary
}

export function LatestRunCard({ run }: LatestRunCardProps) {
	return (
		<div className="mb-3 flex items-center justify-between gap-4 rounded-md border border-edge bg-graphite px-4 py-3 transition-colors hover:border-edge-bright">
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
			<OpenRunPill runId={run.id} size="sm" />
		</div>
	)
}
