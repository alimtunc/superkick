import { LaunchTaskCancelButton } from '@/components/issue-detail/launch-task-feed/LaunchTaskCancelButton'
import { InterventionComposer } from '@/components/launch/InterventionComposer'
import { NowActiveStep } from '@/components/task-cockpit/NowActiveStep'
import { NowLinkedRun } from '@/components/task-cockpit/NowLinkedRun'
import { NowWorktree } from '@/components/task-cockpit/NowWorktree'
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

	return (
		<aside
			aria-label="Now panel"
			className="bg-carbon-dim/40 flex h-full min-h-0 w-80 shrink-0 flex-col border-l border-edge"
		>
			<header className="flex h-9 shrink-0 items-center border-b border-edge px-4">
				<h2 className="font-data text-[11px] font-medium tracking-widest text-silver uppercase">
					Now
				</h2>
			</header>
			<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
				<NowActiveStep step={currentStep} task={task} />
				{linkedRunId ? <NowLinkedRun runId={linkedRunId} /> : null}
				<NowWorktree worktreePath={worktreePath} branchName={branchName} />
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
