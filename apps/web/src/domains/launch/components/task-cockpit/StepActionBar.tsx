import { Button } from '@/components/primitives'
import { useRetryLaunchTask } from '@/hooks/useLaunchTaskActions'
import { canRemediateStep } from '@/lib/launch/stepActions'
import type { LaunchTask, LaunchTaskStep } from '@/types'
import { CornerDownRight, RotateCcw, SquareTerminal } from 'lucide-react'

interface StepActionBarProps {
	task: LaunchTask
	step: LaunchTaskStep
	onTakeover: () => void
}

export function StepActionBar({ task, step, onTakeover }: StepActionBarProps) {
	const retry = useRetryLaunchTask({
		linearIssueId: task.linear_issue_id,
		taskId: task.id,
		linkedRunId: step.linked_run_id ?? undefined
	})
	const remediable = canRemediateStep(task, step)

	return (
		<div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-3 py-1.5">
			{remediable ? (
				<>
					<Button
						variant="outline"
						size="xs"
						onClick={() => retry.mutate('fresh')}
						disabled={retry.isPending}
						title="Re-run this step on a fresh provider thread"
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
						title="Continue the same provider thread"
						className="font-data text-[11px]"
					>
						<CornerDownRight size={12} strokeWidth={1.75} aria-hidden="true" />
						Fix-forward
					</Button>
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
