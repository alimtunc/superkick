import { MatchHighlight } from '@/components/command/MatchHighlight'
import { ResultRowShell } from '@/components/command/ResultRowShell'
import type { SearchActionRow } from '@/types'
import { Icon } from '@/ui/Icon'
import { Kbd } from '@/ui/Kbd'

import { iconForActionKind } from './actionIcon'

interface ActionResultRowProps {
	action: SearchActionRow
	query: string
	selected: boolean
	onSelect: () => void
	onActivate: () => void
}

export function ActionResultRow({ action, query, selected, onSelect, onActivate }: ActionResultRowProps) {
	return (
		<ResultRowShell
			selected={selected}
			onSelect={onSelect}
			onActivate={onActivate}
			leading={<Icon name={iconForActionKind(action.kind)} size={13} className="text-accent" />}
			primary={<MatchHighlight text={action.label} query={query} />}
			secondary={action.hint ?? null}
			trailing={
				action.kbdHints.length > 0 ? (
					<span className="flex items-center gap-1">
						{action.kbdHints.map((hint) => (
							<Kbd key={`${action.id}-${hint}`}>{hint}</Kbd>
						))}
					</span>
				) : null
			}
		/>
	)
}
