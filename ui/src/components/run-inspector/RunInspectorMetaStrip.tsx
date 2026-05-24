import { Pill } from '@/components/ui/pill'
import { fmtRelativeTime, providerLabel } from '@/lib/domain'
import { WORKTREE_PATH_MAX } from '@/lib/launch/display'
import { middleTruncate } from '@/lib/path'
import type { AgentSession, Run } from '@/types'
import { Bot, Clock3, FolderGit2, GitBranch, Workflow } from 'lucide-react'

interface RunInspectorMetaStripProps {
	run: Run
	sessions: AgentSession[]
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

export function RunInspectorMetaStrip({ run, sessions }: RunInspectorMetaStripProps) {
	const session = displayedSession(sessions)
	const provider = session ? (providerLabel[session.provider] ?? session.provider) : null
	const worktree = run.worktree_path ? middleTruncate(run.worktree_path, WORKTREE_PATH_MAX) : null

	return (
		<div className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-2 border-b border-edge bg-carbon px-6 py-3 md:grid-cols-[minmax(90px,.7fr)_minmax(80px,.6fr)_minmax(150px,1fr)_minmax(170px,1fr)_minmax(90px,.6fr)]">
			<div className="min-w-0">
				<div className="font-data text-[10px] tracking-widest text-fg-dim uppercase">Agent</div>
				<div className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-fg">
					<Bot size={13} strokeWidth={1.75} className="shrink-0 text-fg-dim" aria-hidden="true" />
					<span className="truncate">{provider ?? 'No agent'}</span>
				</div>
			</div>
			<div className="min-w-0">
				<div className="font-data text-[10px] tracking-widest text-fg-dim uppercase">Mode</div>
				<div className="mt-1 flex min-w-0 items-center gap-1.5">
					<Workflow
						size={13}
						strokeWidth={1.75}
						className="shrink-0 text-fg-dim"
						aria-hidden="true"
					/>
					{run.execution_mode ? (
						<Pill mono size="xs" tone="neutral">
							{run.execution_mode}
						</Pill>
					) : (
						<span className="text-[12px] text-fg-muted">default</span>
					)}
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
							<GitBranch
								size={13}
								strokeWidth={1.75}
								className="shrink-0 text-fg-dim"
								aria-hidden="true"
							/>
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
							<FolderGit2
								size={13}
								strokeWidth={1.75}
								className="shrink-0"
								aria-hidden="true"
							/>
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
					<Clock3 size={13} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
					<span className="truncate">{fmtRelativeTime(run.started_at)}</span>
				</div>
			</div>
		</div>
	)
}
