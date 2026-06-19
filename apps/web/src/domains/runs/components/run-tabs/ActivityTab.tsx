import { Pill, TabEmptyState } from '@/components/primitives'
import { LedgerList } from '@/domains/runs/components/run-detail/LedgerList'
import { ProtocolActivityList } from '@/domains/runs/components/run-tabs/ProtocolActivityList'
import { hasStructuredActivity } from '@/domains/runs/components/run-tabs/structuredActivity'
import { StructuredActivityList } from '@/domains/runs/components/run-tabs/StructuredActivityList'
import { fmtRelativeTime, hasProtocolActivity, isLedgerEvent } from '@/lib/domain'
import { indexById } from '@/lib/utils'
import type { AgentSession, AttentionRequest, RunEvent } from '@/types'
import { Activity } from 'lucide-react'

interface ActivityTabProps {
	events: RunEvent[]
	sessions: AgentSession[]
	attentionRequests: AttentionRequest[]
}

export function ActivityTab({ events, sessions, attentionRequests }: ActivityTabProps) {
	const sessionById = indexById(sessions)
	const attentionById = indexById(attentionRequests)
	const ledgerEvents = events.filter(isLedgerEvent)
	const pendingAttentions = attentionRequests.filter((r) => r.status === 'pending')
	const protocol = hasProtocolActivity(events)
	const structured = hasStructuredActivity(events)

	if (ledgerEvents.length === 0 && pendingAttentions.length === 0 && !protocol) {
		return (
			<TabEmptyState
				icon={Activity}
				title="No activity yet"
				description="Steps, sessions, and handoffs will appear here as the run progresses."
			/>
		)
	}

	function renderActivity() {
		if (protocol) return <ProtocolActivityList events={events} />
		if (structured) return <StructuredActivityList events={events} />
		return <LedgerList events={ledgerEvents} sessionById={sessionById} attentionById={attentionById} />
	}

	return (
		<div>
			{pendingAttentions.length > 0 ? (
				<ul className="mb-4 space-y-2 border-b border-border pb-4">
					{pendingAttentions.map((request) => (
						<li key={request.id} className="flex items-start gap-2">
							<Pill mono size="xs" tone="needs">
								needs decision
							</Pill>
							<div className="min-w-0 flex-1">
								<div className="truncate text-[12.5px] text-fg">{request.title}</div>
								<div className="font-data text-[10.5px] text-fg-dim">
									{fmtRelativeTime(request.created_at)}
								</div>
							</div>
						</li>
					))}
				</ul>
			) : null}
			{renderActivity()}
		</div>
	)
}
