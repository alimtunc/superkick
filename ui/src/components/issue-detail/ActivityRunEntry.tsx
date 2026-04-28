import { OpenRunPill } from '@/components/issue-detail/OpenRunPill'
import { RunDurationLabel } from '@/components/issue-detail/RunDurationLabel'
import { RunPrBadge } from '@/components/issue-detail/RunPrBadge'
import { RunStateBadge } from '@/components/RunStateBadge'
import { fmtRelativeTime } from '@/lib/domain'
import type { LinkedRunSummary } from '@/types'

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
			<OpenRunPill runId={run.id} size="xs" />
		</div>
	)
}
