import { SessionRow } from '@/components/run-detail/SessionRow'
import type { AgentSession, Run } from '@/types'

export function SessionList({
	sessions,
	run,
	isTerminal
}: {
	sessions: AgentSession[]
	run: Run
	isTerminal: boolean
}) {
	if (sessions.length === 0) return null

	return (
		<div className="space-y-1">
			{sessions.map((session) => (
				<SessionRow key={session.id} session={session} run={run} isTerminal={isTerminal} />
			))}
		</div>
	)
}
