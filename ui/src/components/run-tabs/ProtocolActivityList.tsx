import { useMemo } from 'react'

import { ProtocolActivityRow } from '@/components/run-tabs/ProtocolActivityRow'
import { protocolRows } from '@/lib/domain'
import { cn } from '@/lib/utils'
import type { RunEvent } from '@/types'

interface ProtocolActivityListProps {
	events: readonly RunEvent[]
	className?: string
}

export function ProtocolActivityList({ events, className }: ProtocolActivityListProps) {
	const rows = useMemo(() => protocolRows(events), [events])

	return (
		<ol className={cn('feed', className)}>
			{rows.map(({ event, envelope }) => (
				<ProtocolActivityRow key={event.id} event={event} envelope={envelope} />
			))}
		</ol>
	)
}
