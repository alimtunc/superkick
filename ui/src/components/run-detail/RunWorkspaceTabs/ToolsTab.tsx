import { LedgerRow } from '@/components/run-detail/LedgerRow'
import { EmptyState } from '@/components/ui/state-empty'
import { categoryOf, isLedgerEvent } from '@/lib/domain'
import { indexById } from '@/lib/utils'
import type { AgentSession, AttentionRequest, EventKind, RunEvent } from '@/types'
import { Wrench } from 'lucide-react'

interface ToolsTabProps {
	events: RunEvent[]
	sessions: AgentSession[]
	attentionRequests: AttentionRequest[]
}

function isToolEvent(kind: EventKind): boolean {
	if (kind === 'operator_input' || kind === 'attention_replied') return false
	if (categoryOf(kind) === 'attention') return false
	return true
}

export function ToolsTab({ events, sessions, attentionRequests }: ToolsTabProps) {
	const sessionById = indexById(sessions)
	const attentionById = indexById(attentionRequests)
	const entries = events.filter(isLedgerEvent).filter((event) => isToolEvent(event.kind))

	if (entries.length === 0) {
		return (
			<div className="px-4 py-6">
				<EmptyState
					icon={Wrench}
					title="No tool calls yet"
					description="Structured tool activity will appear here as the run progresses."
				/>
			</div>
		)
	}

	const lastIndex = entries.length - 1
	return (
		<ol className="space-y-1 px-5 py-3 pl-7">
			{entries.map((event, index) => (
				<LedgerRow
					key={event.id}
					event={event}
					sessionById={sessionById}
					attentionById={attentionById}
					connect={index < lastIndex}
				/>
			))}
		</ol>
	)
}
