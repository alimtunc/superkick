import { LaunchRunBadges } from '@/components/launch-queue/LaunchRunBadges'
import { Pill } from '@/components/ui/pill'
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
	const title = stepText ?? item.reason
	const showReason = stepText !== null && item.reason !== stepText

	return (
		<Link
			to="/runs/$runId"
			params={{ runId: run.id }}
			className="flex flex-col gap-2.5 rounded-lg border border-border bg-raised p-3 transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
			title={item.reason}
		>
			<div className="flex items-center gap-2">
				<span className="font-mono text-[11px] text-fg-dim">{run.issue_identifier}</span>
				<span className="flex-1" />
				<LaunchRunBadges item={item} />
				<Pill tone="info" size="xs" mono>
					Run
				</Pill>
			</div>

			<p className="line-clamp-2 text-[12.5px] leading-snug font-medium text-fg">{title}</p>

			<div className="flex items-center gap-2">
				<span className="truncate font-mono text-[10.5px] text-fg-muted">{run.repo_slug}</span>
				<span className="flex-1" />
				<span className="font-mono text-[10.5px] text-fg-dim">
					{fmtElapsed(run.started_at, refTime)}
				</span>
				{run.branch_name ? (
					<span className="max-w-28 truncate font-mono text-[10.5px] text-fg-dim">
						{run.branch_name}
					</span>
				) : null}
			</div>

			{showReason ? <p className="line-clamp-1 text-[10.5px] text-fg-muted">{item.reason}</p> : null}
		</Link>
	)
}
