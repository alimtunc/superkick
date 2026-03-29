import { RunStateBadge } from '@/components/RunStateBadge'
import { fmtDuration, fmtElapsed } from '@/lib/domain'
import type { Run } from '@/types'
import { Link } from '@tanstack/react-router'

export function RunRow({ run, refTime }: { run: Run; refTime: number }) {
	const isTerminal = ['completed', 'failed', 'cancelled'].includes(run.state)

	const duration =
		isTerminal && run.finished_at
			? fmtDuration(new Date(run.finished_at).getTime() - new Date(run.started_at).getTime())
			: fmtElapsed(run.started_at, refTime)

	return (
		<Link
			to="/runs/$runId"
			params={{ runId: run.id }}
			className="panel panel-hover flex items-center gap-4 px-4 py-3"
		>
			<RunStateBadge state={run.state} />

			<span className="font-data w-20 shrink-0 text-[11px] font-medium text-fog">
				{run.issue_identifier}
			</span>

			{run.current_step_key ? (
				<span className="font-data w-16 shrink-0 text-[10px] text-dim uppercase">
					{run.current_step_key.replace(/_/g, ' ')}
				</span>
			) : (
				<span className="w-16 shrink-0" />
			)}

			<span className="font-data min-w-0 flex-1 truncate text-[11px] text-ash">
				{run.repo_slug}
				{run.branch_name ? ` → ${run.branch_name}` : null}
			</span>

			<span className="font-data shrink-0 text-[10px] text-dim">{duration}</span>

			{run.error_message ? (
				<span className="font-data max-w-[180px] shrink-0 truncate text-[10px] text-oxide">
					{run.error_message}
				</span>
			) : null}
		</Link>
	)
}
