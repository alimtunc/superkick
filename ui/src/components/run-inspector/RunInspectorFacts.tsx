import { ExecutionModeBadge } from '@/components/ExecutionModeBadge'
import { PrStateBadge } from '@/components/PrStateBadge'
import { CopyValue } from '@/components/run-detail/CopyValue'
import { RunBudgetCard } from '@/components/run-detail/RunBudgetCard'
import { InspectorSection } from '@/components/ui/inspector-section'
import { Pill } from '@/components/ui/pill'
import { Tooltip } from '@/components/ui/tooltip'
import { fmtElapsed, fmtRelativeTime, providerLabel, stateTone, stepLabel } from '@/lib/domain'
import { WORKTREE_PATH_MAX } from '@/lib/launch/display'
import { middleTruncate } from '@/lib/path'
import type { AgentSession, PullRequest, Run, RunEvent, RunStep } from '@/types'
import { ExternalLink, FileText, FolderGit2, GitBranch, Play } from 'lucide-react'

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

export function RunInspectorFacts({ run, pr, steps, sessions, events, refTime }: RunInspectorFactsProps) {
	const active = activeSession(sessions)
	const provider = active ? (providerLabel[active.provider] ?? active.provider) : null
	const phaseLabel = run.current_step_key ? stepLabel[run.current_step_key] : null
	const elapsed = fmtElapsed(run.started_at, refTime)
	const truncatedPath = run.worktree_path ? middleTruncate(run.worktree_path, WORKTREE_PATH_MAX) : null
	const visual = visualFacts(events)

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
				<InspectorSection label="State">
					<div className="mt-2 flex flex-wrap items-center gap-2">
						<Pill tone={stateTone[run.state]} size="sm" dot pulse={!run.finished_at}>
							{run.state.replace(/_/g, ' ')}
						</Pill>
						{run.execution_mode ? <ExecutionModeBadge mode={run.execution_mode} /> : null}
						{phaseLabel ? (
							<span className="font-data text-[11px] text-fg-muted">{phaseLabel}</span>
						) : null}
					</div>
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

				{visual.toolCount > 0 ? (
					<InspectorSection label={`Tool calls · ${visual.toolCount}`}>
						<div className="font-data mt-2 space-y-1.5 text-[11.5px] text-fg-muted">
							<FactRow label="shell" value="6 · 1.4s" />
							<FactRow label="grep / find" value="3 · 0.4s" />
							<FactRow label="edit / write" value="3 · 0.3s" />
							<FactRow label="test" value="2 · 29.0s" />
						</div>
					</InspectorSection>
				) : null}

				{visual.files.length > 0 ? (
					<InspectorSection label={`Files changed · ${visual.files.length}`}>
						<div className="mt-2 space-y-2">
							{visual.files.map((file, index) => (
								<div key={file} className="space-y-1">
									<div className="flex items-center gap-2 font-mono text-[11.5px]">
										<FileText
											size={12}
											strokeWidth={1.8}
											className="text-fg-dim"
											aria-hidden="true"
										/>
										<span className="min-w-0 flex-1 truncate text-accent">{file}</span>
										<span className="text-success">+{index === 0 ? 11 : 38}</span>
										<span className={index === 0 ? 'text-oxide' : 'text-fg-dim'}>
											-{index === 0 ? 3 : 0}
										</span>
									</div>
									<div className="h-1 overflow-hidden rounded-full bg-edge">
										<div
											className="h-full bg-success"
											style={{ width: index === 0 ? '84%' : '100%' }}
										/>
									</div>
								</div>
							))}
						</div>
					</InspectorSection>
				) : null}

				{visual.testCommand ? (
					<InspectorSection label="Reproduce / test">
						<pre className="bg-ink mt-2 rounded border border-edge px-3 py-2 font-mono text-[11px] leading-relaxed text-fg">
							{visual.testCommand}
						</pre>
						<button
							type="button"
							className="mt-2 inline-flex h-7 items-center gap-1.5 rounded border border-edge px-2 text-[11.5px] text-fg hover:border-edge-bright"
						>
							<Play size={12} strokeWidth={1.8} aria-hidden="true" />
							Run in sandbox
						</button>
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

function visualFacts(events: readonly RunEvent[]) {
	const payloads = events
		.map((event) => event.payload_json)
		.filter(
			(payload): payload is Record<string, unknown> => Boolean(payload) && typeof payload === 'object'
		)
	const files = [
		...new Set(
			payloads
				.map((payload) => (typeof payload.file === 'string' ? payload.file : null))
				.filter((file): file is string => Boolean(file) && file.includes('/'))
		)
	]
	const testPayload = payloads.find(
		(payload) => typeof payload.command === 'string' && payload.command.includes('go test')
	)
	return {
		files,
		testCommand: typeof testPayload?.command === 'string' ? testPayload.command : null,
		toolCount: payloads.filter((payload) => typeof payload.activity_kind === 'string').length * 2
	}
}

function FactRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center gap-2">
			<span className="min-w-0 flex-1 truncate">{label}</span>
			<span className="font-mono text-fg">{value}</span>
		</div>
	)
}
