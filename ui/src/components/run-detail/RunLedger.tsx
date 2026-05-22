import { LedgerList } from '@/components/run-detail/LedgerList'
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

	return (
		<LedgerList
			events={entries}
			sessionById={sessionById}
			attentionById={attentionById}
			className="relative space-y-1.5 pl-4"
		/>
	)
}
