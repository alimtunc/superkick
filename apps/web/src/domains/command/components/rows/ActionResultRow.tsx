import { Icon } from '@/components/primitives'
import { MatchHighlight } from '@/domains/command/components/MatchHighlight'
import { ResultRowShell } from '@/domains/command/components/ResultRowShell'
import type { SearchActionRow } from '@/types'

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
			leading={<Icon name={iconForActionKind(action.kind)} size={16} className="text-accent" />}
			primary={<MatchHighlight text={action.label} query={query} />}
			secondary={action.hint ?? null}
			trailing={
				action.kbdHints.length > 0 ? (
					<span className="font-mono text-[11px] text-fg-dim">{action.kbdHints.join(' ')}</span>
				) : null
			}
		/>
	)
}
