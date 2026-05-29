import { LaunchRunBadges } from '@/components/launch-queue/LaunchRunBadges'
import { Pill } from '@/components/ui/pill'
import { fmtElapsed, stepLabel } from '@/lib/domain'
import type { LaunchQueueItem } from '@/types'
import { Link } from '@tanstack/react-router'

interface KanbanRunCardProps {
	item: Extract<LaunchQueueItem, { kind: 'run' }>
	refTime: number
}

export function KanbanRunCard({ item, refTime }: KanbanRunCardProps) {
	const { run } = item
	const stepText = run.current_step_key ? (stepLabel[run.current_step_key] ?? run.current_step_key) : null
	const linkedIdentifier = item.linked_issue?.identifier ?? run.issue_identifier

	return (
		<Link
			to="/runs/$runId"
			params={{ runId: run.id }}
			className="kcard block focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
			title={item.reason}
		>
			<div className="kcard__top">
				<span className="kcard__id mono">{linkedIdentifier}</span>
				<span className="spacer" />
				<Pill tone="info" size="xs" mono>
					Run
				</Pill>
			</div>

			<p className="kcard__title line-clamp-2">{stepText ?? item.reason}</p>

			<div className="kcard__foot">
				<span className="truncate font-mono text-[10.5px] text-fg-muted">{run.repo_slug}</span>
				<LaunchRunBadges item={item} />
				<span className="spacer" />
				<span className="font-mono text-[10.5px] text-fg-dim">
					{fmtElapsed(run.started_at, refTime)}
				</span>
			</div>
		</Link>
	)
}
