import { RunPrBadge } from '@/components/issue-detail/RunPrBadge'
import { RunStateBadge } from '@/components/RunStateBadge'
import { fmtRelativeTime } from '@/lib/domain'
import type { LinkedRunSummary } from '@/types'
import { Link } from '@tanstack/react-router'

interface RunHistoryRowProps {
	run: LinkedRunSummary
}

export function RunHistoryRow({ run }: RunHistoryRowProps) {
	return (
		<div className="flex items-center gap-3">
			<Link
				to="/runs/$runId"
				params={{ runId: run.id }}
				className="panel panel-hover flex min-w-0 flex-1 items-center gap-3 px-3 py-2"
			>
				<RunStateBadge state={run.state} />
				<span className="font-data text-[11px] text-dim">{fmtRelativeTime(run.started_at)}</span>
			</Link>
			{run.pr ? <RunPrBadge pr={run.pr} className="shrink-0" /> : null}
		</div>
	)
}
