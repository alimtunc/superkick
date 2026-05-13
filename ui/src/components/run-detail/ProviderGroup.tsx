import { useState } from 'react'

import { SessionRow } from '@/components/run-detail/SessionRow'
import { agentStatusColor, providerLabel } from '@/lib/domain'
import type { AgentSession, AgentStatus, ProviderGroupData, Run } from '@/types'
import { ChevronDown, ChevronRight } from 'lucide-react'

function groupStatus(sessions: AgentSession[]): AgentStatus {
	const priority: AgentStatus[] = ['running', 'starting', 'failed', 'cancelled', 'completed']
	for (const status of priority) {
		if (sessions.some((session) => session.status === status)) return status
	}
	return 'completed'
}

export function ProviderGroup({
	group,
	run,
	isTerminal
}: {
	group: ProviderGroupData
	run: Run
	isTerminal: boolean
}) {
	const [expanded, setExpanded] = useState(() => {
		return group.sessions.some(
			(session) =>
				session.status === 'running' || session.status === 'starting' || session.status === 'failed'
		)
	})

	const status = groupStatus(group.sessions)
	const label = providerLabel[group.provider] ?? group.provider

	return (
		<div className="rounded border border-edge/50 bg-graphite/50">
			<button
				type="button"
				onClick={() => setExpanded((prev) => !prev)}
				className="flex w-full items-center gap-3 px-3 py-2 text-left"
			>
				<span className="inline-flex text-dim">
					{expanded ? (
						<ChevronDown size={13} strokeWidth={1.75} aria-hidden="true" />
					) : (
						<ChevronRight size={13} strokeWidth={1.75} aria-hidden="true" />
					)}
				</span>
				<span className="font-data text-[12px] font-medium text-fog">{label}</span>
				<span className={`font-data text-[10px] ${agentStatusColor[status]}`}>
					{group.sessions.length} {group.sessions.length === 1 ? 'task' : 'tasks'}
				</span>
			</button>

			{expanded ? (
				<div className="border-t border-edge/30 px-1 pb-1">
					{group.sessions.map((session) => (
						<SessionRow key={session.id} session={session} run={run} isTerminal={isTerminal} />
					))}
				</div>
			) : null}
		</div>
	)
}
