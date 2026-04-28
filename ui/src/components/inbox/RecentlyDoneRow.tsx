import { StatusChip } from '@/components/issue-detail/StatusChip'
import { RunStateBadge } from '@/components/RunStateBadge'
import { fmtRelativeTime } from '@/lib/domain'
import type { RecentlyDoneEntry } from '@/types'
import { Link } from '@tanstack/react-router'

interface RecentlyDoneRowProps {
	entry: RecentlyDoneEntry
	/** Stable reference time so the row doesn't re-derive Date.now() on every render. */
	refTime: number
}

/**
 * Compact one-line row for the Recently Done section. Branches on
 * `LaunchQueueItem.kind` so we can link runs to `/runs/$runId` and issues
 * to `/issues/$issueId` while keeping the visual rhythm consistent.
 */
export function RecentlyDoneRow({ entry, refTime }: RecentlyDoneRowProps) {
	const { item } = entry
	if (item.kind === 'run') {
		return (
			<Link
				to="/runs/$runId"
				params={{ runId: item.run.id }}
				className="flex items-center gap-3 border-l-2 border-transparent px-3 py-2 transition-colors hover:border-l-mineral hover:bg-slate-deep/40 focus-visible:border-l-mineral focus-visible:bg-slate-deep/40 focus-visible:outline-none"
			>
				<RunStateBadge state={item.run.state} />
				<span className="font-data shrink-0 text-[11px] font-medium text-fog">
					{item.run.issue_identifier}
				</span>
				<span className="font-data flex-1 truncate text-[10px] text-silver">{item.reason}</span>
				<span className="font-data text-[10px] text-ash">
					{fmtRelativeTime(entry.timestamp, refTime)}
				</span>
			</Link>
		)
	}
	return (
		<Link
			to="/issues/$issueId"
			params={{ issueId: item.issue.id }}
			className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-slate-deep/50"
		>
			<StatusChip status={item.issue.status} />
			<span className="font-data shrink-0 text-[11px] font-medium text-fog">
				{item.issue.identifier}
			</span>
			<span className="font-data flex-1 truncate text-[10px] text-silver">{item.issue.title}</span>
			<span className="font-data text-[10px] text-dim">
				{fmtRelativeTime(entry.timestamp, refTime)}
			</span>
		</Link>
	)
}
