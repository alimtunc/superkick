import { CopyValue } from '@/components/run-detail/CopyValue'
import { useSessionAttach } from '@/hooks/useSessionAttach'
import { fmtDuration } from '@/lib/domain'
import type { AgentSession, AgentStatus, AttachPayload, Run } from '@/types'

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

const ATTACHABLE_STATUSES = new Set<AgentStatus>(['starting', 'running', 'failed'])

function sessionDuration(session: AgentSession): string {
	if (!session.started_at) return ''
	const end = session.finished_at ? new Date(session.finished_at).getTime() : Date.now()
	return fmtDuration(end - new Date(session.started_at).getTime())
}

function AttachPanel({ payload, onReset }: { payload: AttachPayload; onReset: () => void }) {
	const isRecovery = payload.attach_kind === 'recovery_shell'

	return (
		<div className="mt-2 space-y-2 border-t border-edge/30 pt-2">
			<div className="flex items-center justify-between">
				<span
					className={`font-data text-[11px] font-medium ${isRecovery ? 'text-oxide' : 'text-cyan'}`}
				>
					{payload.title}
				</span>
				<button
					type="button"
					onClick={onReset}
					className="font-data text-[10px] text-dim transition-colors hover:text-fog"
				>
					Dismiss
				</button>
			</div>
			<p className="font-data text-[10px] text-silver/60">{payload.summary}</p>

			<div className="space-y-1.5">
				<div>
					<span className="font-data text-[9px] text-dim uppercase">Command</span>
					<CopyValue
						value={payload.command}
						className="font-data mt-0.5 block text-[10px] text-fog/80"
					/>
				</div>
				<div>
					<span className="font-data text-[9px] text-dim uppercase">Worktree</span>
					<CopyValue
						value={payload.worktree_path}
						className="font-data mt-0.5 block text-[10px] text-fog/80"
					/>
				</div>
			</div>

			<ul className="space-y-0.5">
				{payload.limitations.map((lim) => (
					<li key={lim} className="font-data text-[9px] text-dim">
						&bull; {lim}
					</li>
				))}
			</ul>
		</div>
	)
}

function SessionRow({ session, run, isTerminal }: { session: AgentSession; run: Run; isTerminal: boolean }) {
	const { attach, payload, isPending, error, reset } = useSessionAttach()
	const canAttach = !isTerminal && ATTACHABLE_STATUSES.has(session.status)

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

			{canAttach && !payload ? (
				<div className="mt-2 border-t border-edge/30 pt-2">
					<button
						type="button"
						disabled={isPending}
						onClick={() => attach(run.id, session.id)}
						className="font-data text-[10px] text-cyan/70 transition-colors hover:text-cyan disabled:opacity-50"
					>
						{isPending ? 'Preparing...' : 'Attach externally'}
					</button>
					<span className="font-data ml-2 text-[9px] text-dim">
						Prepare a recovery shell in this run's workspace
					</span>
					{error ? <p className="font-data mt-1 text-[10px] text-oxide">{error}</p> : null}
				</div>
			) : null}

			{payload ? <AttachPanel payload={payload} onReset={reset} /> : null}
		</div>
	)
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
	if (sessions.length === 0) return null

	return (
		<div className="space-y-1">
			{sessions.map((session) => (
				<SessionRow key={session.id} session={session} run={run} isTerminal={isTerminal} />
			))}
		</div>
	)
}
