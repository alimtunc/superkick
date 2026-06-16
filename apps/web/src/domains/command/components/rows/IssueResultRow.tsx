import { Avatar, PriorityIcon, StatusIcon } from '@/components/primitives'
import { MatchHighlight } from '@/domains/command/components/MatchHighlight'
import { ResultRowShell } from '@/domains/command/components/ResultRowShell'
import { PRIORITY_META, priorityIconKindFromValue } from '@/lib/domain'
import { formatShortDate } from '@/lib/format'
import type { SearchIssueRow } from '@/types'

import { stateTypeToStatusKind } from './statusMap'

interface IssueResultRowProps {
	issue: SearchIssueRow
	query: string
	selected: boolean
	onSelect: () => void
	onActivate: () => void
}

const STATE_LABEL: Record<string, string> = {
	backlog: 'backlog',
	unstarted: 'open',
	started: 'in progress',
	completed: 'done',
	canceled: 'cancelled'
}

export function IssueResultRow({ issue, query, selected, onSelect, onActivate }: IssueResultRowProps) {
	const priority = PRIORITY_META[issue.priorityValue]
	const subParts = [
		priority ? `P${issue.priorityValue}` : null,
		STATE_LABEL[issue.stateType] ?? null,
		issue.project,
		formatShortDate(issue.updatedAt)
	].filter((p): p is string => Boolean(p))
	return (
		<ResultRowShell
			selected={selected}
			onSelect={onSelect}
			onActivate={onActivate}
			leading={
				<>
					<PriorityIcon kind={priorityIconKindFromValue(issue.priorityValue)} size={14} />
					<StatusIcon kind={stateTypeToStatusKind(issue.stateType)} size={14} />
					<span className="font-mono text-[11px] text-fg-dim">{issue.identifier}</span>
				</>
			}
			primary={<MatchHighlight text={issue.title} query={query} />}
			secondary={subParts.join(' · ')}
			trailing={issue.assigneeName ? <Avatar name={issue.assigneeName} size={18} /> : null}
		/>
	)
}
