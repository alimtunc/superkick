import { LedgerRow } from '@/components/run-detail/LedgerRow'
import { EmptyState } from '@/components/ui/state-empty'
import { isLedgerEvent } from '@/lib/domain'
import { indexById } from '@/lib/utils'
import type { AgentSession, AttentionRequest, RunEvent } from '@/types'
import { Activity } from 'lucide-react'

interface RunLedgerProps {
	events: RunEvent[]
	sessions: AgentSession[]
	attentionRequests: AttentionRequest[]
}

// Primary operator-visible orchestration thread. Raw agent_output /
// command_output events are intentionally excluded and live under the
// terminal-inspection surface as supporting evidence.
export function RunLedger({ events, sessions, attentionRequests }: RunLedgerProps) {
	const sessionById = indexById(sessions)
	const attentionById = indexById(attentionRequests)
	const entries = events.filter(isLedgerEvent)

	if (entries.length === 0) {
		return (
			<EmptyState
				icon={Activity}
				title="No orchestration events yet"
				description="Structured activity will appear here as the run progresses."
			/>
		)
	}

	const lastIndex = entries.length - 1
	return (
		<ol className="relative space-y-1.5 pl-4">
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
