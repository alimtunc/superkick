import { LAUNCH_STEP_KIND_LABEL, LAUNCH_STEP_STATUS_TONE } from '@/lib/domain'
import { cn } from '@/lib/utils'
import type { LaunchTask, LaunchTaskStep } from '@/types'
import { Dot } from '@/ui/Dot'
import { Check } from 'lucide-react'

interface LaunchPlanStripProps {
	task: LaunchTask
	steps: readonly LaunchTaskStep[]
	variant?: 'chips' | 'stepper'
}

export function LaunchPlanStrip({ task, steps, variant = 'chips' }: LaunchPlanStripProps) {
	const done = steps.filter((s) => s.status === 'completed').length
	const total = steps.length

	if (variant === 'chips') {
		return (
			<div className="sticky top-0 z-10 border-b border-border bg-surface px-6 py-3.5">
				<div className="mb-2 flex items-center gap-2.5">
					<span className="text-[11px] font-semibold tracking-wider text-fg-dim uppercase">
						Plan
					</span>
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

	return (
		<div className="sticky top-0 z-10 border-b border-border bg-surface px-6 py-4">
			<div className="grid grid-cols-[1fr_1.4fr_1fr] items-center gap-6">
				{steps.map((step, index) => {
					const tone = LAUNCH_STEP_STATUS_TONE[step.status]
					const isCurrent = step.id === task.current_step_id
					const isDone = step.status === 'completed'
					return (
						<div
							key={step.id}
							className={cn(
								'relative flex min-w-0 items-center gap-3',
								index === 1 ? 'justify-center' : index === 2 ? 'justify-end' : null
							)}
						>
							{index > 0 ? (
								<span className="absolute right-1/2 left-[-50%] h-px translate-x-[-20px] bg-edge" />
							) : null}
							<div
								className={cn(
									'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border bg-surface',
									isCurrent ? 'border-accent ring-4 ring-accent/10' : 'border-edge',
									isDone ? 'border-success text-success' : null
								)}
							>
								{isDone ? (
									<Check size={14} strokeWidth={2} aria-hidden="true" />
								) : (
									<Dot
										tone={tone}
										size={6}
										pulse={isCurrent && step.status === 'running'}
									/>
								)}
							</div>
							<div className="relative z-10 min-w-0">
								<div className="truncate text-[13px] font-semibold text-fg">
									{LAUNCH_STEP_KIND_LABEL[step.step_kind]}
								</div>
								<div className="font-data mt-0.5 truncate text-[11px] text-fg-dim">
									{step.step_kind === 'plan'
										? 'drafted · 32s'
										: step.step_kind === 'implement'
											? `${done} / ${total} · ${isCurrent ? '8m elapsed' : step.status}`
											: step.status === 'pending'
												? 'awaiting'
												: step.status}
								</div>
							</div>
						</div>
					)
				})}
			</div>
			<span className="sr-only">
				{done} of {total} done
			</span>
		</div>
	)
}
