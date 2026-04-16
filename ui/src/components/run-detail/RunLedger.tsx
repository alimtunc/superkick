import { useMemo } from 'react'

import { LedgerRow } from '@/components/run-detail/LedgerRow'
import { isLedgerEvent } from '@/lib/domain'
import { indexById } from '@/lib/utils'
import type { AgentSession, AttentionRequest, RunEvent } from '@/types'

interface RunLedgerProps {
	events: RunEvent[]
	sessions: AgentSession[]
	attentionRequests: AttentionRequest[]
}

// Primary operator-visible orchestration thread. Raw agent_output /
// command_output events are intentionally excluded and live under the
// terminal-inspection surface as supporting evidence.
export function RunLedger({ events, sessions, attentionRequests }: RunLedgerProps) {
	const sessionById = useMemo(() => indexById(sessions), [sessions])
	const attentionById = useMemo(() => indexById(attentionRequests), [attentionRequests])
	const entries = useMemo(() => events.filter(isLedgerEvent), [events])

	if (entries.length === 0) {
		return (
			<p className="font-data rounded-lg border border-edge bg-carbon px-3 py-6 text-center text-[12px] text-dim">
				No orchestration events yet. Structured activity will appear here as the run progresses.
			</p>
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
