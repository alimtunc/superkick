import { useState } from 'react'

import { AttachPanel } from '@/components/run-detail/AttachPanel'
import { CopyValue } from '@/components/run-detail/CopyValue'
import { useSessionAttach } from '@/hooks/useSessionAttach'
import { fmtDuration } from '@/lib/domain'
import type { AgentSession, AgentStatus, Run } from '@/types'

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

const ATTACHABLE_STATUSES = new Set<AgentStatus>(['starting', 'running', 'failed'])

function sessionDuration(session: AgentSession): string {
	if (!session.started_at) return ''
	const end = session.finished_at ? new Date(session.finished_at).getTime() : Date.now()
	return fmtDuration(end - new Date(session.started_at).getTime())
}

export function SessionRow({
	session,
	run,
	isTerminal
}: {
	session: AgentSession
	run: Run
	isTerminal: boolean
}) {
	const [expanded, setExpanded] = useState(false)
	const { attach, payload, isPending, error, reset } = useSessionAttach()
	const canAttach = !isTerminal && ATTACHABLE_STATUSES.has(session.status)

	return (
		<div className="px-3 py-1.5">
			<button
				type="button"
				onClick={() => setExpanded((prev) => !prev)}
				className="-mx-1 flex w-full items-center gap-3 rounded px-1 text-left transition-colors hover:bg-edge/20"
			>
				<span className={`text-sm ${statusColor[session.status]}`}>{statusIcon[session.status]}</span>
				<span className="font-data text-[11px] text-dim">{session.status}</span>
				{session.exit_code !== null ? (
					<span
						className={`font-data text-[10px] ${session.exit_code === 0 ? 'text-mineral' : 'text-oxide'}`}
					>
						exit {session.exit_code}
					</span>
				) : null}

				<span className="ml-auto flex items-center gap-2">
					<span className="font-data text-[10px] text-dim">
						cmd {expanded ? '\u25B4' : '\u25BE'}
					</span>
					<span className="font-data text-[11px] text-dim">{sessionDuration(session)}</span>
				</span>
			</button>

			{expanded ? (
				<div className="mt-1.5 ml-5 overflow-hidden rounded bg-carbon p-2">
					<CopyValue
						value={session.command}
						className="font-data text-[10px] break-all text-silver/60"
					/>
				</div>
			) : null}

			{canAttach && !payload ? (
				<div className="mt-1 ml-5">
					<button
						type="button"
						disabled={isPending}
						onClick={() => attach(run.id, session.id)}
						className="font-data text-[10px] text-cyan/70 transition-colors hover:text-cyan disabled:opacity-50"
					>
						{isPending ? 'preparing...' : 'attach'}
					</button>
				</div>
			) : null}

			{canAttach && payload ? (
				<div className="mt-1.5 ml-5">
					<AttachPanel payload={payload} onReset={reset} />
				</div>
			) : null}

			{error ? <p className="font-data mt-1 ml-5 text-[10px] text-oxide">{error}</p> : null}
		</div>
	)
}
