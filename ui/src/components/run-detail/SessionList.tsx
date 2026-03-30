import { CopyValue } from '@/components/run-detail/CopyValue'
import { fmtDuration } from '@/lib/domain'
import type { AgentSession, AgentStatus } from '@/types'

const statusIcon: Record<AgentStatus, string> = {
	starting: '\u25cb',
	running: '\u25cf',
	completed: '\u2713',
	failed: '\u2717',
	cancelled: '\u2014'
}

const statusColor: Record<AgentStatus, string> = {
	starting: 'text-dim',
	running: 'text-cyan live-pulse',
	completed: 'text-mineral',
	failed: 'text-oxide',
	cancelled: 'text-dim'
}

const providerLabel: Record<string, string> = {
	claude: 'Claude',
	codex: 'Codex'
}

function sessionDuration(session: AgentSession): string {
	if (!session.started_at) return ''
	const end = session.finished_at ? new Date(session.finished_at).getTime() : Date.now()
	return fmtDuration(end - new Date(session.started_at).getTime())
}

function resumeCommand(session: AgentSession): string | null {
	if (session.provider === 'claude') {
		return `claude --continue --session-id ${session.id}`
	}
	return null
}

function SessionRow({ session }: { session: AgentSession }) {
	const resume = resumeCommand(session)
	const canResume = session.status === 'running' || session.status === 'failed'

	return (
		<div className="rounded border border-edge/50 bg-graphite/50 px-3 py-2.5">
			<div className="flex items-center gap-3">
				<span className={`text-base ${statusColor[session.status]}`}>
					{statusIcon[session.status]}
				</span>
				<span className="font-data text-[12px] font-medium text-fog">
					{providerLabel[session.provider] ?? session.provider}
				</span>
				<span className="font-data text-[11px] text-dim">{session.status}</span>
				{session.exit_code !== null ? (
					<span
						className={`font-data text-[10px] ${session.exit_code === 0 ? 'text-mineral' : 'text-oxide'}`}
					>
						exit {session.exit_code}
					</span>
				) : null}
				<span className="font-data ml-auto text-[11px] text-dim">{sessionDuration(session)}</span>
			</div>

			<div className="mt-1.5">
				<CopyValue value={session.command} className="font-data text-[10px] text-silver/60" />
			</div>

			{canResume && resume ? (
				<div className="mt-2 flex items-center gap-2 border-t border-edge/30 pt-2">
					<span className="font-data text-[10px] text-dim">Resume:</span>
					<CopyValue value={resume} className="font-data text-[10px] text-cyan/70" />
				</div>
			) : null}
		</div>
	)
}

export function SessionList({ sessions }: { sessions: AgentSession[] }) {
	if (sessions.length === 0) return null

	return (
		<div className="space-y-1">
			{sessions.map((session) => (
				<SessionRow key={session.id} session={session} />
			))}
		</div>
	)
}
