import { LAUNCH_STEP_KIND_LABEL, LAUNCH_STEP_STATUS_TONE } from '@/lib/domain'
import { cn } from '@/lib/utils'
import type { LaunchTask, LaunchTaskStep } from '@/types'
import { Dot } from '@/ui/Dot'

interface LaunchPlanStripProps {
	task: LaunchTask
	steps: readonly LaunchTaskStep[]
}

export function LaunchPlanStrip({ task, steps }: LaunchPlanStripProps) {
	const done = steps.filter((s) => s.status === 'completed').length
	const total = steps.length
	return (
		<div className="sticky top-0 z-10 border-b border-border bg-surface px-6 py-3.5">
			<div className="mb-2 flex items-center gap-2.5">
				<span className="text-[11px] font-semibold tracking-wider text-fg-dim uppercase">Plan</span>
				<span className="flex-1" />
				<span className="text-[11.5px] text-fg-muted">
					{done} of {total} done
				</span>
			</div>
			<div className="flex flex-wrap gap-1.5">
				{steps.map((step) => {
					const tone = LAUNCH_STEP_STATUS_TONE[step.status]
					const isCurrent = step.id === task.current_step_id
					const isPending = step.status === 'pending'
					return (
						<div
							key={step.id}
							className={cn(
								'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px]',
								isPending
									? 'border-dashed border-border bg-transparent text-fg-dim'
									: 'border-border bg-raised text-fg'
							)}
						>
							<Dot tone={tone} size={6} pulse={isCurrent && step.status === 'running'} />
							<span>{LAUNCH_STEP_KIND_LABEL[step.step_kind]}</span>
						</div>
					)
				})}
			</div>
		</div>
	)
}
