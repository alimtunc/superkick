import { LedgerRow } from '@/domains/runs/components/run-detail/LedgerRow'
import { cn } from '@/lib/utils'
import type { AgentSession, AttentionRequest, RunEvent } from '@/types'

interface LedgerListProps {
	events: readonly RunEvent[]
	sessionById: Map<string, AgentSession>
	attentionById: Map<string, AttentionRequest>
	className?: string
}

export function LedgerList({ events, sessionById, attentionById, className }: LedgerListProps) {
	return (
		<ol className={cn('feed', className)}>
			{events.map((event) => (
				<LedgerRow
					key={event.id}
					event={event}
					sessionById={sessionById}
					attentionById={attentionById}
				/>
			))}
		</ol>
	)
}
