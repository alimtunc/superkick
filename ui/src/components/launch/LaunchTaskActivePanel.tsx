import { LaunchTaskStepsBody } from '@/components/launch/LaunchTaskStepsBody'
import { launchTaskStepsQuery } from '@/lib/queries'
import { cn } from '@/lib/utils'
import type { LaunchTask, LaunchTaskStatus, LaunchTaskStep } from '@/types'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

interface LaunchTaskActivePanelProps {
	task: LaunchTask
}

const STATUS_LABEL: Record<LaunchTaskStatus, string> = {
	pending: 'Pending',
	running: 'Running',
	needs_human: 'Needs human',
	completed: 'Completed',
	failed: 'Failed',
	cancelled: 'Cancelled'
}

const STATUS_TONE: Record<LaunchTaskStatus, string> = {
	pending: 'border-edge bg-carbon text-silver',
	running: 'border-mineral/40 bg-mineral-dim text-mineral',
	needs_human: 'border-gold/40 bg-gold-dim text-gold',
	completed: 'border-edge bg-carbon text-silver',
	failed: 'border-oxide/40 bg-oxide-dim text-oxide',
	cancelled: 'border-edge bg-carbon text-dim'
}

function pickCurrentStep(steps: readonly LaunchTaskStep[], task: LaunchTask): LaunchTaskStep | null {
	if (task.current_step_id) {
		const byId = steps.find((s) => s.id === task.current_step_id)
		if (byId) return byId
	}
	const running = steps.find((s) => s.status === 'running' || s.status === 'needs_human')
	if (running) return running
	const pending = steps.find((s) => s.status === 'pending')
	if (pending) return pending
	if (steps.length === 0) return null
	return steps.reduce((max, s) => (s.sequence > max.sequence ? s : max))
}

/**
 * SUP-117 — replaces the launcher once a Launch Task exists for the issue.
 * Surfaces the parent task status, the current step, and a link to the
 * associated run when one is wired (links are appended by SUP-118 / step
 * runtime). Polling cadence is owned by `useLaunchTasksForIssue` upstream.
 */
export function LaunchTaskActivePanel({ task }: LaunchTaskActivePanelProps) {
	const stepsQuery = useQuery(launchTaskStepsQuery(task.id))
	const steps = stepsQuery.data ?? []
	const currentStep = pickCurrentStep(steps, task)
	const linkedRunId = currentStep?.linked_run_id ?? null

	return (
		<div className="rounded-md border border-edge bg-slate-deep p-4">
			<div className="mb-3 flex items-center justify-between">
				<p className="font-data text-[11px] tracking-wider text-dim uppercase">
					Plan → Implement → Review
				</p>
				<span
					className={cn(
						'font-data rounded border px-2 py-0.5 text-[10px] tracking-wider uppercase',
						STATUS_TONE[task.status]
					)}
				>
					{STATUS_LABEL[task.status]}
				</span>
			</div>

			<LaunchTaskStepsBody
				isLoading={stepsQuery.isLoading}
				isError={stepsQuery.isError}
				error={stepsQuery.error}
				onRetry={() => stepsQuery.refetch()}
				steps={steps}
				currentStep={currentStep}
			/>

			{linkedRunId ? (
				<div className="mt-3">
					<Link
						to="/runs/$runId"
						params={{ runId: linkedRunId }}
						className="font-data inline-flex items-center gap-1 text-[11px] text-mineral hover:underline"
					>
						View linked run →
					</Link>
				</div>
			) : null}
		</div>
	)
}
