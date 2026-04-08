import { useMemo } from 'react'

import { ProviderGroup, type ProviderGroupData } from '@/components/run-detail/ProviderGroup'
import type { AgentSession, Run } from '@/types'

function groupByProvider(sessions: AgentSession[]): ProviderGroupData[] {
	const map = new Map<string, AgentSession[]>()
	for (const session of sessions) {
		const existing = map.get(session.provider)
		if (existing) {
			existing.push(session)
		} else {
			map.set(session.provider, [session])
		}
	}
	return Array.from(map.entries()).map(([provider, grouped]) => ({ provider, sessions: grouped }))
}

export function SessionList({
	sessions,
	run,
	isTerminal
}: {
	sessions: AgentSession[]
	run: Run
	isTerminal: boolean
}) {
	const groups = useMemo(() => groupByProvider(sessions), [sessions])

	if (sessions.length === 0) return null

	return (
		<div className="space-y-1">
			{groups.map((group) => (
				<ProviderGroup key={group.provider} group={group} run={run} isTerminal={isTerminal} />
			))}
		</div>
	)
}
