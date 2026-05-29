import { LedgerList } from '@/components/run-detail/LedgerList'
import { hasStructuredActivity } from '@/components/run-tabs/structuredActivity'
import { StructuredActivityList } from '@/components/run-tabs/StructuredActivityList'
import { Pill } from '@/components/ui/pill'
import { TabEmptyState } from '@/components/ui/state-empty-tab'
import { fmtRelativeTime, isLedgerEvent } from '@/lib/domain'
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
	const structured = hasStructuredActivity(events)

	if (ledgerEvents.length === 0 && pendingAttentions.length === 0) {
		return (
			<TabEmptyState
				icon={Activity}
				title="No activity yet"
				description="Steps, sessions, and handoffs will appear here as the run progresses."
			/>
		)
	}

	return (
		<div className="px-5 py-3 pl-7">
			{pendingAttentions.length > 0 ? (
				<ul className="mb-3 space-y-2 border-b border-border pb-3">
					{pendingAttentions.map((request) => (
						<li key={request.id} className="flex items-start gap-2">
							<Pill mono size="xs" tone="warn">
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
			{structured ? (
				<StructuredActivityList events={events} />
			) : (
				<LedgerList events={ledgerEvents} sessionById={sessionById} attentionById={attentionById} />
			)}
		</div>
	)
}
