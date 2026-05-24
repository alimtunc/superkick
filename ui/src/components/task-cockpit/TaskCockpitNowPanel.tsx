import { LaunchTaskCancelButton } from '@/components/issue-detail/launch-task-feed/LaunchTaskCancelButton'
import { InterventionComposer } from '@/components/launch/InterventionComposer'
import { Pill } from '@/components/ui/pill'
import { LAUNCH_STEP_KIND_LABEL } from '@/lib/domain'
import { WORKTREE_PATH_MAX } from '@/lib/launch/display'
import { middleTruncate } from '@/lib/path'
import type { LaunchTask, LaunchTaskStep } from '@/types'

interface TaskCockpitNowPanelProps {
	task: LaunchTask
	steps: readonly LaunchTaskStep[]
	isTerminal: boolean
	linkedRunId: string | null
	worktreePath: string | null
	branchName: string | null
}

export function TaskCockpitNowPanel({
	task,
	steps,
	isTerminal,
	linkedRunId,
	worktreePath,
	branchName
}: TaskCockpitNowPanelProps) {
	const currentStep = steps.find((s) => s.id === task.current_step_id) ?? null
	const changedFiles = [...new Set(steps.flatMap((step) => step.structured_result?.changed_files ?? []))]
	const truncatedPath = worktreePath ? middleTruncate(worktreePath, WORKTREE_PATH_MAX) : null

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
					<Fact label="id" value={linkedRunId ?? 'not attached'} mono />
					<Fact label="agent" value={currentStep?.agent_name ?? 'not assigned'} mono />
					<Fact label="model" value={currentStep?.model ?? 'default'} mono />
				</section>

				<section className="space-y-2 border-t border-edge pt-4">
					<div className="font-data text-[10px] tracking-widest text-fg-dim uppercase">
						Worktree
					</div>
					<Fact label="branch" value={branchName ?? 'not set'} mono />
					<Fact
						label="path"
						value={truncatedPath ?? 'not attached'}
						title={worktreePath ?? undefined}
						mono
					/>
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
			{!isTerminal ? (
				<>
					<div className="shrink-0 border-t border-edge">
						<InterventionComposer
							linearIssueId={task.linear_issue_id}
							taskId={task.id}
							disabled={false}
						/>
					</div>
					<div className="flex shrink-0 justify-end border-t border-edge px-4 py-2">
						<LaunchTaskCancelButton linearIssueId={task.linear_issue_id} taskId={task.id} />
					</div>
				</>
			) : null}
		</aside>
	)
}

interface FactProps {
	label: string
	value: string
	mono?: boolean
	title?: string
}

function Fact({ label, value, mono = false, title }: FactProps) {
	return (
		<div className="grid grid-cols-[70px_1fr] gap-2 text-[12px]">
			<span className="font-data text-[11px] text-fg-dim">{label}</span>
			<span className={mono ? 'truncate font-mono text-fg' : 'truncate text-fg'} title={title ?? value}>
				{value}
			</span>
		</div>
	)
}
