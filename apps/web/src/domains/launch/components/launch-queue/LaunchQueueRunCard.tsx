import { LaunchRunBadges } from '@/domains/launch/components/launch-queue/LaunchRunBadges'
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
			className="kcard block focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
			title={item.reason}
		>
			<div className="kcard__top">
				<span className="kcard__id">{run.issue_identifier}</span>
				<span className="spacer" />
				<LaunchRunBadges item={item} />
				<span className="pill pill--accent mono">Run</span>
			</div>

			<p className="kcard__title line-clamp-2">{title}</p>

			<div className="kcard__foot">
				<span className="truncate font-mono text-[10.5px] text-fg-muted">{run.repo_slug}</span>
				<span className="spacer" />
				<span className="font-mono text-[10.5px] text-fg-dim">
					{fmtElapsed(run.started_at, refTime)}
				</span>
				{run.branch_name ? (
					<span className="max-w-28 truncate font-mono text-[10.5px] text-fg-dim">
						{run.branch_name}
					</span>
				) : null}
			</div>

			{showReason ? (
				<p className="mt-1 line-clamp-1 text-[10.5px] text-fg-muted">{item.reason}</p>
			) : null}
		</Link>
	)
}
