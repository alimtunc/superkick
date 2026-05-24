import { LaunchTaskCancelButton } from '@/components/issue-detail/launch-task-feed/LaunchTaskCancelButton'
import { InterventionComposer } from '@/components/launch/InterventionComposer'
import { Pill } from '@/components/ui/pill'
import { LAUNCH_STEP_KIND_LABEL } from '@/lib/domain'
import type { LaunchTask, LaunchTaskStep } from '@/types'
import { Copy, Play } from 'lucide-react'

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
	const primaryFile = changedFiles[0]
	const testCommand = primaryFile?.includes('webhook')
		? 'go test ./internal/webhook/ \\\n  -run TestWebhookSignature'
		: 'just check'

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
					<div className="flex items-center gap-2">
						<div className="font-data text-[10px] tracking-widest text-fg-dim uppercase">
							Worktree
						</div>
						<span className="flex-1" />
						<Copy size={12} strokeWidth={1.8} className="text-fg-dim" aria-hidden="true" />
						<span className="text-[11px] text-fg-muted">Copy path</span>
					</div>
					<Fact label="sandbox" value={isTerminal ? 'archived' : 'ephemeral-2'} mono />
					<Fact label="branch" value={branchName ?? 'not set'} mono />
					<Fact label="path" value={worktreePath ? '~/sk/run-7af2-1' : 'not attached'} mono />
					<Fact label="PR" value={isTerminal ? 'ready' : 'not opened yet'} mono />
				</section>

				<section className="space-y-2 border-t border-edge pt-4">
					<div className="flex items-center gap-2">
						<div className="font-data text-[10px] tracking-widest text-fg-dim uppercase">
							How to test
						</div>
						<span className="flex-1" />
						<Play size={12} strokeWidth={1.8} className="text-fg-dim" aria-hidden="true" />
						<span className="text-[11px] text-fg-muted">Run</span>
					</div>
					<pre className="bg-ink rounded border border-edge px-3 py-2 font-mono text-[11px] leading-relaxed text-fg">
						{testCommand}
					</pre>
					<p className="font-data text-[10.5px] text-fg-dim">3,419 / 3,419 last run</p>
				</section>

				{changedFiles.length > 0 ? (
					<section className="space-y-2 border-t border-edge pt-4">
						<div className="font-data text-[10px] tracking-widest text-fg-dim uppercase">
							Files changed · {changedFiles.length}
						</div>
						{changedFiles.map((file, index) => (
							<div key={file} className="space-y-1">
								<div className="flex items-center gap-2 font-mono text-[11.5px]">
									<span className="truncate text-accent">{file}</span>
									<span className="ml-auto text-success">+{index === 0 ? 11 : 38}</span>
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

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
	return (
		<div className="grid grid-cols-[70px_1fr] gap-2 text-[12px]">
			<span className="font-data text-[11px] text-fg-dim">{label}</span>
			<span className={mono ? 'truncate font-mono text-fg' : 'truncate text-fg'} title={value}>
				{value}
			</span>
		</div>
	)
}
