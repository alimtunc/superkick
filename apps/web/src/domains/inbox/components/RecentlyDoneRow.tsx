import { Pill } from '@/components/primitives'
import { actionLinkWrap } from '@/domains/inbox/components/actionLinkWrap'
import { InboxActionPill } from '@/domains/inbox/components/InboxActionPill'
import { InboxRow } from '@/domains/inbox/components/InboxRow'
import { fmtRelativeTime } from '@/lib/domain'
import { pickPrimaryAction } from '@/lib/inbox/actions'
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
			wrap={actionLinkWrap(action, summary.identifier)}
			actions={<InboxActionPill action={action} />}
		/>
	)
}
