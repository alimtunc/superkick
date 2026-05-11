import { InboxActionLink } from '@/components/inbox/InboxActionLink'
import { InboxActionPill } from '@/components/inbox/InboxActionPill'
import { StatusChip } from '@/components/issue-detail/StatusChip'
import { RunStateBadge } from '@/components/RunStateBadge'
import { fmtRelativeTime } from '@/lib/domain'
import { inboxActionAriaLabel, pickPrimaryAction } from '@/lib/inbox/actions'
import type { RecentlyDoneEntry } from '@/types'

interface RecentlyDoneRowProps {
	entry: RecentlyDoneEntry
	/** Stable reference time so the row doesn't re-derive Date.now() on every render. */
	refTime: number
}

export function RecentlyDoneRow({ entry, refTime }: RecentlyDoneRowProps) {
	const action = pickPrimaryAction({ kind: 'recently-done', entry })
	const { item } = entry
	const className =
		'group flex items-center gap-3 border-l-2 border-transparent px-3 py-2 transition-colors hover:border-l-mineral hover:bg-slate-deep/40 focus-visible:border-l-mineral focus-visible:bg-slate-deep/40 focus-visible:outline-none'

	if (item.kind === 'run') {
		return (
			<InboxActionLink
				action={action}
				ariaLabel={inboxActionAriaLabel(action, item.run.issue_identifier)}
				className={className}
			>
				<RunStateBadge state={item.run.state} />
				<span className="font-data shrink-0 text-[11px] font-medium text-fog">
					{item.run.issue_identifier}
				</span>
				<span className="font-data flex-1 truncate text-[10px] text-silver">{item.reason}</span>
				<span className="font-data text-[10px] text-ash">
					{fmtRelativeTime(entry.timestamp, refTime)}
				</span>
				<InboxActionPill action={action} />
			</InboxActionLink>
		)
	}

	return (
		<InboxActionLink
			action={action}
			ariaLabel={inboxActionAriaLabel(action, item.issue.identifier)}
			className={className}
		>
			<StatusChip status={item.issue.status} />
			<span className="font-data shrink-0 text-[11px] font-medium text-fog">
				{item.issue.identifier}
			</span>
			<span className="font-data flex-1 truncate text-[10px] text-silver">{item.issue.title}</span>
			<span className="font-data text-[10px] text-dim">
				{fmtRelativeTime(entry.timestamp, refTime)}
			</span>
			<InboxActionPill action={action} />
		</InboxActionLink>
	)
}
