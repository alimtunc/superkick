import { LaunchRunBadges } from '@/components/launch-queue/LaunchRunBadges'
import { fmtElapsed, stepLabel } from '@/lib/domain'
import type { LaunchQueueItem } from '@/types'
import { Link } from '@tanstack/react-router'

interface LaunchQueueRunCardProps {
	item: Extract<LaunchQueueItem, { kind: 'run' }>
	refTime: number
}

export function LaunchQueueRunCard({ item, refTime }: LaunchQueueRunCardProps) {
	const { run } = item
	const stepText = run.current_step_key ? (stepLabel[run.current_step_key] ?? run.current_step_key) : null

	return (
		<div
			className="group flex flex-col gap-1 px-3 py-2.5 transition-colors hover:bg-slate-deep/50"
			title={item.reason}
		>
			<Link to="/runs/$runId" params={{ runId: run.id }} className="flex flex-col gap-1">
				<div className="flex items-center justify-between gap-2">
					<span className="font-data text-[12px] font-medium text-fog transition-colors group-hover:text-neon-green">
						{run.issue_identifier}
					</span>
					<LaunchRunBadges item={item} />
				</div>
				<div className="flex items-center gap-2">
					<span className="font-data truncate text-[10px] text-dim">{run.repo_slug}</span>
					{stepText ? <span className="font-data text-[10px] text-ash">{stepText}</span> : null}
				</div>
				<p className="font-data truncate text-[10px] text-silver">{item.reason}</p>
				<div className="flex items-center justify-between">
					<span className="font-data text-[10px] text-dim">
						{fmtElapsed(run.started_at, refTime)}
					</span>
					{run.branch_name ? (
						<span className="font-data max-w-28 truncate text-[10px] text-dim">
							{run.branch_name}
						</span>
					) : null}
				</div>
			</Link>
		</div>
	)
}
