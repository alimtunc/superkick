import { LedgerRow } from '@/components/run-detail/LedgerRow'
import { cn } from '@/lib/utils'
import type { AgentSession, AttentionRequest, RunEvent } from '@/types'

interface LedgerListProps {
	events: readonly RunEvent[]
	sessionById: Map<string, AgentSession>
	attentionById: Map<string, AttentionRequest>
	className?: string
}

export function LedgerList({ events, sessionById, attentionById, className }: LedgerListProps) {
	const lastIndex = events.length - 1
	return (
		<ol className={cn('space-y-1', className)}>
			{events.map((event, index) => (
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
