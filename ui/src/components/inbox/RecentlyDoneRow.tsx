import { InboxActionLink } from '@/components/inbox/InboxActionLink'
import { InboxActionPill } from '@/components/inbox/InboxActionPill'
import { InboxRow } from '@/components/inbox/InboxRow'
import { Pill } from '@/components/ui/pill'
import { fmtRelativeTime } from '@/lib/domain'
import { inboxActionAriaLabel, pickPrimaryAction } from '@/lib/inbox/actions'
import { summariseRecentlyDone } from '@/lib/inbox/recentlyDone'
import type { RecentlyDoneEntry } from '@/types'

interface RecentlyDoneRowProps {
	entry: RecentlyDoneEntry
	refTime: number
}

export function RecentlyDoneRow({ entry, refTime }: RecentlyDoneRowProps) {
	const action = pickPrimaryAction({ kind: 'recently-done', entry })
	const summary = summariseRecentlyDone(entry)

	return (
		<InboxRow
			tone={summary.tone}
			title={summary.title}
			sub={
				<Pill tone={summary.tone} size="sm" dot>
					{summary.pillLabel}
				</Pill>
			}
			why={summary.why}
			ctx={summary.ctx}
			age={fmtRelativeTime(entry.timestamp, refTime)}
			wrap={(inner) => (
				<InboxActionLink
					action={action}
					ariaLabel={inboxActionAriaLabel(action, summary.identifier)}
					className="flex min-w-0 flex-1 items-start"
				>
					{inner}
				</InboxActionLink>
			)}
			actions={<InboxActionPill action={action} />}
		/>
	)
}
