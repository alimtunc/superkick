import { Avatar, Icon } from '@/components/primitives'
import { fmtRelativeTime, providerLabel } from '@/lib/domain'
import { WORKTREE_PATH_MAX } from '@/lib/launch/display'
import { middleTruncate } from '@/lib/path'
import type { AgentSession, Run } from '@/types'

export type RunMetaStripDensity = 'comfortable' | 'compact'

interface RunMetaStripProps {
	run: Run
	sessions: AgentSession[]
	density?: RunMetaStripDensity
}

function displayedSession(sessions: AgentSession[]): AgentSession | null {
	const latest = sessions.reduce<AgentSession | null>(
		(current, session) =>
			current && current.started_at.localeCompare(session.started_at) >= 0 ? current : session,
		null
	)
	return (
		sessions.find((s) => s.status === 'running') ??
		sessions.find((s) => s.status === 'starting') ??
		latest
	)
}

const DENSITY_PAD: Record<RunMetaStripDensity, string> = {
	comfortable: 'px-6 py-3',
	compact: 'px-4 py-2.5'
}

function CompactContext({ run, sessions }: { run: Run; sessions: AgentSession[] }) {
	const session = displayedSession(sessions)
	const provider = session ? (providerLabel[session.provider] ?? session.provider) : null
	const mode = run.execution_mode === 'semi_auto' ? 'semi-auto' : 'full-auto'

	return (
		<div
			className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border bg-canvas px-4 py-2.5"
			data-density="compact"
		>
			<span className="ctx">
				<span className="ctx__k">Agent</span>
				{session ? (
					<Avatar agent={session.provider} id={session.id} size={16} className="avatar--sm" />
				) : null}
				<span className="ctx__v">{provider ?? 'No agent'}</span>
			</span>
			<span className="ctx">
				<span className="ctx__k">Branch</span>
				{run.branch_name ? (
					<>
						<Icon name="branch" size={13} className="ic text-fg-dim" />
						<span className="ctx__v" title={run.branch_name}>
							{run.branch_name}
						</span>
					</>
				) : (
					<span className="ctx__v">not set</span>
				)}
			</span>
			<span className="ctx">
				<span className="ctx__k">Mode</span>
				<span className="ctx__v">{mode}</span>
			</span>
			<span className="ctx">
				<span className="ctx__k">Started</span>
				<span className="ctx__v">{fmtRelativeTime(run.started_at)}</span>
			</span>
		</div>
	)
}

function ComfortableMeta({ run, sessions }: { run: Run; sessions: AgentSession[] }) {
	const session = displayedSession(sessions)
	const provider = session ? (providerLabel[session.provider] ?? session.provider) : null
	const worktree = run.worktree_path ? middleTruncate(run.worktree_path, WORKTREE_PATH_MAX) : null

	return (
		<div
			className={`grid shrink-0 grid-cols-2 gap-x-4 gap-y-2 border-b border-border bg-surface ${DENSITY_PAD.comfortable} md:grid-cols-[minmax(90px,.7fr)_minmax(110px,.8fr)_minmax(150px,1fr)_minmax(170px,1fr)_minmax(90px,.6fr)]`}
			data-density="comfortable"
		>
			<div className="min-w-0">
				<div className="font-data text-[10px] tracking-widest text-fg-dim uppercase">Agent</div>
				<div className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-fg">
					<Icon name="bot" size={13} className="shrink-0 text-fg-dim" />
					<span className="truncate">{provider ?? 'No agent'}</span>
				</div>
			</div>
			<div className="min-w-0">
				<div className="font-data text-[10px] tracking-widest text-fg-dim uppercase">Model</div>
				<div className="mt-1 flex min-w-0 items-center gap-1.5">
					<Icon name="zap" size={13} className="shrink-0 text-fg-dim" />
					<span className="truncate text-[12px] text-fg-muted">not attached</span>
				</div>
			</div>
			<div className="min-w-0">
				<div className="font-data text-[10px] tracking-widest text-fg-dim uppercase">Branch</div>
				<div className="mt-1 min-w-0">
					{run.branch_name ? (
						<span
							className="inline-flex max-w-full min-w-0 items-center gap-1.5 font-mono text-[11.5px] text-fg"
							title={run.branch_name}
						>
							<Icon name="branch" size={13} className="shrink-0 text-fg-dim" />
							<span className="truncate">{run.branch_name}</span>
						</span>
					) : (
						<span className="text-[12px] text-fg-muted">not set</span>
					)}
				</div>
			</div>
			<div className="min-w-0">
				<div className="font-data text-[10px] tracking-widest text-fg-dim uppercase">Worktree</div>
				<div className="mt-1 min-w-0">
					{run.worktree_path && worktree ? (
						<span
							className="inline-flex max-w-full min-w-0 items-center gap-1.5 font-mono text-[11.5px] text-fg-muted"
							title={run.worktree_path}
						>
							<Icon name="folder" size={13} className="shrink-0" />
							<span className="truncate">{worktree}</span>
						</span>
					) : (
						<span className="text-[12px] text-fg-muted">not attached</span>
					)}
				</div>
			</div>
			<div className="min-w-0">
				<div className="font-data text-[10px] tracking-widest text-fg-dim uppercase">Started</div>
				<div className="font-data mt-1 flex min-w-0 items-center gap-1.5 text-[11.5px] text-fg-muted">
					<Icon name="clock" size={13} className="shrink-0" />
					<span className="truncate">{fmtRelativeTime(run.started_at)}</span>
				</div>
			</div>
		</div>
	)
}

export function RunMetaStrip({ run, sessions, density = 'comfortable' }: RunMetaStripProps) {
	if (density === 'compact') return <CompactContext run={run} sessions={sessions} />
	return <ComfortableMeta run={run} sessions={sessions} />
}
