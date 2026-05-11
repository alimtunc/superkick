import { InboxActionLink } from '@/components/inbox/InboxActionLink'
import { InboxActionPill } from '@/components/inbox/InboxActionPill'
import { Pill } from '@/components/ui/pill'
import { inboxActionAriaLabel, pickPrimaryAction } from '@/lib/inbox/actions'
import { NEEDS_HUMAN_REASON_LABEL, NEEDS_HUMAN_REASON_PILL_TONE } from '@/lib/inbox/needsHuman'
import type { NeedsHumanItem } from '@/types'

interface NeedsHumanRowProps {
	item: NeedsHumanItem
}

export function NeedsHumanRow({ item }: NeedsHumanRowProps) {
	const action = pickPrimaryAction({ kind: 'needs-human', item })
	const identifier =
		item.source.kind === 'launch-issue'
			? item.source.item.issue.identifier
			: item.source.run.issue_identifier

	return (
		<InboxActionLink
			action={action}
			ariaLabel={inboxActionAriaLabel(action, identifier)}
			className="group flex items-center gap-3 border-l-2 border-transparent px-3 py-2 transition-colors hover:border-l-oxide hover:bg-slate-deep/40 focus-visible:border-l-oxide focus-visible:bg-slate-deep/40 focus-visible:outline-none"
		>
			<Pill
				tone={NEEDS_HUMAN_REASON_PILL_TONE[item.reasonKind]}
				size="xs"
				className="tracking-wider uppercase"
			>
				{NEEDS_HUMAN_REASON_LABEL[item.reasonKind]}
			</Pill>
			<span className="font-data shrink-0 text-[11px] font-medium text-fog">{identifier}</span>
			<span className="font-data flex-1 truncate text-[10px] text-silver">{item.reason}</span>
			<InboxActionPill action={action} />
		</InboxActionLink>
	)
}
