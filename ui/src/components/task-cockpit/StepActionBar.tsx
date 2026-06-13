import { Button } from '@/components/ui/button'
import { useRetryLaunchTask } from '@/hooks/useLaunchTaskActions'
import { canRemediateStep, isPaidStep } from '@/lib/launch/stepActions'
import type { LaunchTask, LaunchTaskStep } from '@/types'
import { CornerDownRight, RotateCcw, SquareTerminal } from 'lucide-react'

interface StepActionBarProps {
	task: LaunchTask
	step: LaunchTaskStep
	onTakeover: () => void
}

// SUP-203 — per-step operator actions over the derived RunContextSnapshot:
// retry (fresh provider thread), fix-forward (resume the same thread), and
// takeover (the run-level PTY escape hatch, already snapshot-wired). Retry and
// fix-forward show only on the parked `needs_human` step; takeover is always
// available.
export function StepActionBar({ task, step, onTakeover }: StepActionBarProps) {
	const retry = useRetryLaunchTask({
		linearIssueId: task.linear_issue_id,
		taskId: task.id,
		linkedRunId: step.linked_run_id ?? undefined
	})
	const remediable = canRemediateStep(task, step)
	const paid = isPaidStep(step)

	return (
		<div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-3 py-1.5">
			{remediable ? (
				<>
					<Button
						variant="outline"
						size="xs"
						onClick={() => retry.mutate('fresh')}
						disabled={retry.isPending}
						title={
							paid
								? 'Re-run this step on a fresh provider thread — re-spends paid Agent SDK credits'
								: 'Re-run this step on a fresh provider thread'
						}
						className="font-data text-[11px]"
					>
						<RotateCcw size={12} strokeWidth={1.75} aria-hidden="true" />
						Retry fresh
					</Button>
					<Button
						variant="outline"
						size="xs"
						onClick={() => retry.mutate('fix_forward')}
						disabled={retry.isPending}
						title={
							paid
								? 'Continue the same provider thread — re-spends paid Agent SDK credits'
								: 'Continue the same provider thread'
						}
						className="font-data text-[11px]"
					>
						<CornerDownRight size={12} strokeWidth={1.75} aria-hidden="true" />
						Fix-forward
					</Button>
					{paid ? (
						<span
							className="font-data text-[10px] text-fg-dim"
							title="This step bills paid Agent SDK credits"
						>
							paid · Agent SDK
						</span>
					) : null}
				</>
			) : null}
			<Button
				variant="ghost"
				size="xs"
				onClick={onTakeover}
				className="font-data text-[11px]"
				title="Open the interactive terminal escape hatch with the run's snapshot context"
			>
				<SquareTerminal size={12} strokeWidth={1.75} aria-hidden="true" />
				Take over
			</Button>
		</div>
	)
}
