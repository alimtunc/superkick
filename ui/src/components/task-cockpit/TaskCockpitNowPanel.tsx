import type { ReactNode } from 'react'

import { LaunchTaskCancelButton } from '@/components/issue-detail/launch-task-feed/LaunchTaskCancelButton'
import { PrStateBadge } from '@/components/PrStateBadge'
import { Pill } from '@/components/ui/pill'
import { LAUNCH_STEP_KIND_LABEL } from '@/lib/domain'
import { WORKTREE_PATH_MAX } from '@/lib/launch/display'
import { middleTruncate } from '@/lib/path'
import { useRunDrawerStore } from '@/stores/runDrawer'
import type { LaunchTask, LaunchTaskStep, PullRequest } from '@/types'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, ExternalLink } from 'lucide-react'

interface TaskCockpitNowPanelProps {
	task: LaunchTask
	steps: readonly LaunchTaskStep[]
	isTerminal: boolean
	linkedRunId: string | null
	worktreePath: string | null
	branchName: string | null
	pr: PullRequest | null
}

export function TaskCockpitNowPanel({
	task,
	steps,
	isTerminal,
	linkedRunId,
	worktreePath,
	branchName,
	pr
}: TaskCockpitNowPanelProps) {
	const currentStep = steps.find((s) => s.id === task.current_step_id) ?? null
	const changedFiles = [...new Set(steps.flatMap((step) => step.structured_result?.changed_files ?? []))]
	const truncatedPath = worktreePath ? middleTruncate(worktreePath, WORKTREE_PATH_MAX) : null
	const issueIdentifier = task.linear_issue_id
	const openDrawer = useRunDrawerStore((s) => s.openDrawer)

	return (
		<aside
			aria-label="Now panel"
			className="bg-carbon-dim/40 flex h-full min-h-0 w-80 shrink-0 flex-col border-l border-edge"
		>
			<header className="flex h-9 shrink-0 items-center gap-2 border-b border-edge px-4">
				<h2 className="font-data text-[11px] font-medium tracking-widest text-silver uppercase">
					Now
				</h2>
				<span className="flex-1" />
				<Pill tone="info" size="xs" dot pulse={!isTerminal}>
					{task.status.replace(/_/g, ' ')}
				</Pill>
			</header>
			<div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
				<section>
					<p className="text-[13px] font-semibold text-fg">
						{currentStep?.summary ?? 'Waiting for the next execution step.'}
					</p>
					<p className="font-data mt-1 text-[11px] text-fg-dim">
						{currentStep
							? `${LAUNCH_STEP_KIND_LABEL[currentStep.step_kind]} · ${currentStep.status}`
							: 'No active step'}
					</p>
				</section>

				<section className="space-y-2 border-t border-edge pt-4">
					<div className="font-data text-[10px] tracking-widest text-fg-dim uppercase">Run</div>
					{linkedRunId ? (
						<>
							<FactRow label="id">
								<Link
									to="/runs/$runId"
									params={{ runId: linkedRunId }}
									className="truncate font-mono text-fg hover:text-accent focus-visible:rounded focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
									title={linkedRunId}
								>
									{linkedRunId}
								</Link>
							</FactRow>
							<FactRow label="">
								<button
									type="button"
									onClick={() => openDrawer(linkedRunId, 'activity')}
									className="font-data inline-flex items-center gap-1 self-start text-[11px] text-fg-muted hover:text-fg focus-visible:rounded focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
								>
									open drawer
									<ArrowUpRight size={11} strokeWidth={1.85} aria-hidden="true" />
								</button>
							</FactRow>
						</>
					) : (
						<FactRow label="id">
							<span className="truncate font-mono text-fg" title="not attached">
								not attached
							</span>
						</FactRow>
					)}
					<FactRow label="agent">
						<span
							className="truncate font-mono text-fg"
							title={currentStep?.agent_name ?? 'not assigned'}
						>
							{currentStep?.agent_name ?? 'not assigned'}
						</span>
					</FactRow>
					<FactRow label="model">
						<span
							className="truncate font-mono text-fg"
							title={currentStep?.model ?? 'not attached'}
						>
							{currentStep?.model ?? 'not attached'}
						</span>
					</FactRow>
				</section>

				<section className="space-y-2 border-t border-edge pt-4">
					<div className="font-data text-[10px] tracking-widest text-fg-dim uppercase">
						Worktree
					</div>
					<FactRow label="branch">
						<span className="truncate font-mono text-fg" title={branchName ?? 'not set'}>
							{branchName ?? 'not set'}
						</span>
					</FactRow>
					<FactRow label="path">
						<span
							className="truncate font-mono text-fg"
							title={worktreePath ?? truncatedPath ?? 'not attached'}
						>
							{truncatedPath ?? 'not attached'}
						</span>
					</FactRow>
					{pr ? (
						<FactRow label="pr">
							<a
								href={pr.url}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex min-w-0 items-center gap-1.5 truncate font-mono text-fg hover:text-accent focus-visible:rounded focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
								title={pr.url}
							>
								<ExternalLink
									size={11}
									strokeWidth={1.85}
									className="shrink-0"
									aria-hidden="true"
								/>
								#{pr.number}
								<PrStateBadge state={pr.state} />
							</a>
						</FactRow>
					) : null}
				</section>

				{changedFiles.length > 0 ? (
					<section className="space-y-2 border-t border-edge pt-4">
						<div className="font-data text-[10px] tracking-widest text-fg-dim uppercase">
							Files changed · {changedFiles.length}
						</div>
						{changedFiles.map((file) => (
							<div key={file} className="flex items-center gap-2 font-mono text-[11.5px]">
								<span className="truncate text-accent" title={file}>
									{file}
								</span>
							</div>
						))}
					</section>
				) : null}
			</div>
			{task.status === 'needs_human' && issueIdentifier ? (
				<div className="flex shrink-0 items-center justify-between gap-2 border-t border-edge px-4 py-2">
					<span className="font-data text-[10px] tracking-widest text-fg-dim uppercase">
						Intervene
					</span>
					<Link
						to="/issues/$issueId"
						params={{ issueId: issueIdentifier }}
						className="inline-flex items-center gap-1 rounded-md border border-warn/40 px-2.5 py-1 text-[12px] text-warn hover:bg-warn/10 focus-visible:ring-2 focus-visible:ring-warn/40 focus-visible:outline-none"
						aria-label={`Open issue ${issueIdentifier}`}
					>
						Open issue
						<ArrowUpRight size={12} strokeWidth={1.85} aria-hidden="true" />
					</Link>
				</div>
			) : null}
			{!isTerminal && task.status !== 'needs_human' ? (
				<div className="flex shrink-0 items-center justify-between gap-2 border-t border-edge px-4 py-2">
					<span className="font-data text-[10px] tracking-widest text-fg-dim uppercase">
						Intervene
					</span>
					<LaunchTaskCancelButton linearIssueId={task.linear_issue_id} taskId={task.id} />
				</div>
			) : null}
		</aside>
	)
}

function FactRow({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid grid-cols-[70px_1fr] gap-2 text-[12px]">
			<span className="font-data text-[11px] text-fg-dim">{label}</span>
			{children}
		</div>
	)
}
