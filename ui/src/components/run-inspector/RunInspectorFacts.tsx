import { PrStateBadge } from '@/components/PrStateBadge'
import { CopyValue } from '@/components/run-detail/CopyValue'
import { RunBudgetCard } from '@/components/run-detail/RunBudgetCard'
import { InspectorSection } from '@/components/ui/inspector-section'
import { Tooltip } from '@/components/ui/tooltip'
import { fmtElapsed, fmtRelativeTime, providerLabel, stepLabel } from '@/lib/domain'
import { WORKTREE_PATH_MAX } from '@/lib/launch/display'
import { middleTruncate } from '@/lib/path'
import type { AgentSession, PullRequest, Run, RunEvent, RunStep } from '@/types'
import { ExternalLink, FileText, FolderGit2, GitBranch } from 'lucide-react'

interface RunInspectorFactsProps {
	run: Run
	pr: PullRequest | null
	steps: RunStep[]
	sessions: AgentSession[]
	events: RunEvent[]
	refTime: number
}

function activeSession(sessions: AgentSession[]): AgentSession | null {
	return (
		sessions.find((s) => s.status === 'running') ?? sessions.find((s) => s.status === 'starting') ?? null
	)
}

function changedFilesFrom(events: readonly RunEvent[]): string[] {
	return [
		...new Set(
			events.flatMap((event) => {
				const payload = event.payload_json
				if (!payload || typeof payload !== 'object') return []
				const file = (payload as { file?: unknown }).file
				return typeof file === 'string' && file.includes('/') ? [file] : []
			})
		)
	]
}

export function RunInspectorFacts({ run, pr, steps, sessions, events, refTime }: RunInspectorFactsProps) {
	const active = activeSession(sessions)
	const provider = active ? (providerLabel[active.provider] ?? active.provider) : null
	const phaseLabel = run.current_step_key ? stepLabel[run.current_step_key] : null
	const elapsed = fmtElapsed(run.started_at, refTime)
	const truncatedPath = run.worktree_path ? middleTruncate(run.worktree_path, WORKTREE_PATH_MAX) : null
	const changedFiles = changedFilesFrom(events)

	return (
		<aside
			aria-label="Run facts"
			className="bg-carbon-dim/40 flex h-full min-h-0 w-80 shrink-0 flex-col border-l border-edge"
		>
			<header className="flex h-9 shrink-0 items-center border-b border-edge px-4">
				<h2 className="font-data text-[11px] font-medium tracking-widest text-silver uppercase">
					Facts
				</h2>
			</header>
			<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
				<InspectorSection label="Progress">
					{phaseLabel ? <p className="font-data mt-2 text-[12px] text-fg">{phaseLabel}</p> : null}
					<p className="font-data mt-1.5 text-[11px] text-fg-dim">
						{run.finished_at
							? `Finished ${fmtRelativeTime(run.finished_at)}`
							: `Running ${elapsed}`}
					</p>
				</InspectorSection>

				{provider ? (
					<InspectorSection label="Agent">
						<p className="font-data mt-2 text-[12px] text-fg">{provider}</p>
					</InspectorSection>
				) : null}

				{changedFiles.length > 0 ? (
					<InspectorSection label={`Files changed · ${changedFiles.length}`}>
						<div className="mt-2 space-y-1.5">
							{changedFiles.map((file) => (
								<div key={file} className="flex items-center gap-2 font-mono text-[11.5px]">
									<FileText
										size={12}
										strokeWidth={1.8}
										className="shrink-0 text-fg-dim"
										aria-hidden="true"
									/>
									<span className="min-w-0 flex-1 truncate text-accent" title={file}>
										{file}
									</span>
								</div>
							))}
						</div>
					</InspectorSection>
				) : null}

				<InspectorSection label="Workspace">
					<div className="mt-2 flex flex-col gap-1.5">
						{run.branch_name ? (
							<CopyValue
								value={run.branch_name}
								display={
									<span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] text-fg">
										<GitBranch size={12} strokeWidth={1.85} aria-hidden="true" />
										{run.branch_name}
									</span>
								}
							/>
						) : null}
						{run.worktree_path && truncatedPath ? (
							<Tooltip label={run.worktree_path}>
								<CopyValue
									value={run.worktree_path}
									display={
										<span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] text-fg-muted">
											<FolderGit2 size={12} strokeWidth={1.85} aria-hidden="true" />
											{truncatedPath}
										</span>
									}
								/>
							</Tooltip>
						) : null}
						<span className="font-data text-[11px] text-fg-dim">
							{run.repo_slug} · {run.trigger_source}
						</span>
					</div>
				</InspectorSection>

				{pr ? (
					<InspectorSection label="Pull request">
						<a
							href={pr.url}
							target="_blank"
							rel="noopener noreferrer"
							className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-success/40 px-2.5 py-1.5 text-[12px] text-success transition-colors hover:bg-success/10 focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:outline-none"
						>
							<ExternalLink size={12} strokeWidth={1.85} aria-hidden="true" />
							<span className="font-data">#{pr.number}</span>
							<PrStateBadge state={pr.state} />
						</a>
					</InspectorSection>
				) : null}

				<RunBudgetCard run={run} steps={steps} refTime={refTime} />
			</div>
		</aside>
	)
}
