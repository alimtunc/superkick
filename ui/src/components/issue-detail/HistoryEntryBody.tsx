import { formatHistoryEvent } from '@/components/issue-detail/historyFormat'
import { joinWithAnd } from '@/components/issue-detail/joinWithAnd'
import type { IssueHistoryEntry } from '@/types'

interface HistoryEntryBodyProps {
	entry: IssueHistoryEntry
}

export function HistoryEntryBody({ entry }: HistoryEntryBodyProps) {
	const parts = entry.events.map((event, index) => (
		<span key={`${entry.id}-${index}`}>{formatHistoryEvent(event, entry.actor)}</span>
	))
	return <span className="text-fg-muted">{joinWithAnd(parts)}</span>
}
