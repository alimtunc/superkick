import { actionLinkWrap } from '@/components/inbox/actionLinkWrap'
import { InboxActionPill } from '@/components/inbox/InboxActionPill'
import { InboxRow } from '@/components/inbox/InboxRow'
import { Pill } from '@/components/ui/pill'
import { useNow } from '@/hooks/useNow'
import { fmtRelativeTime } from '@/lib/domain'
import { pickPrimaryAction } from '@/lib/inbox/actions'
import {
	NEEDS_HUMAN_REASON_LABEL,
	NEEDS_HUMAN_REASON_TONE,
	needsHumanRowAgeIso,
	needsHumanRowIdentifier,
	needsHumanRowTitle
} from '@/lib/inbox/needsHuman'
import type { NeedsHumanItem } from '@/types'

interface NeedsHumanRowProps {
	item: NeedsHumanItem
}

export function NeedsHumanRow({ item }: NeedsHumanRowProps) {
	const refTime = useNow()
	const action = pickPrimaryAction({ kind: 'needs-human', item })
	const tone = NEEDS_HUMAN_REASON_TONE[item.reasonKind]
	const identifier = needsHumanRowIdentifier(item)
	const ageIso = needsHumanRowAgeIso(item)

	return (
		<InboxRow
			tone={tone}
			title={needsHumanRowTitle(item)}
			sub={
				<Pill tone={tone} size="sm" dot>
					{NEEDS_HUMAN_REASON_LABEL[item.reasonKind]}
				</Pill>
			}
			why={item.reason}
			ctx={identifier}
			age={ageIso ? fmtRelativeTime(ageIso, refTime) : null}
			wrap={actionLinkWrap(action, identifier)}
			actions={<InboxActionPill action={action} />}
		/>
	)
}
