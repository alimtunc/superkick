import { Pill } from '@/components/ui/pill'
import { LAUNCH_STEP_KIND_LABEL, LAUNCH_STEP_STATUS_LABEL, LAUNCH_STEP_STATUS_TONE } from '@/lib/domain'
import { cn } from '@/lib/utils'
import type { LaunchTaskStep } from '@/types'

interface StepFocusSelectorProps {
	steps: readonly LaunchTaskStep[]
	selectedStepId: string | null
	onSelect: (stepId: string | null) => void
}

function chipClass(active: boolean): string {
	return cn(
		'inline-flex h-9 items-center gap-1.5 border-b-2 px-3 text-[12.5px] font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
		active ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg'
	)
}

export function StepFocusSelector({ steps, selectedStepId, onSelect }: StepFocusSelectorProps) {
	const visible = steps.filter((step) => step.enabled !== false)

	return (
		<div
			role="tablist"
			aria-label="Step focus"
			className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-surface px-2"
		>
			<button
				type="button"
				role="tab"
				aria-selected={selectedStepId === null}
				onClick={() => onSelect(null)}
				className={chipClass(selectedStepId === null)}
			>
				All steps
			</button>
			{visible.map((step) => {
				const active = selectedStepId === step.id
				return (
					<button
						key={step.id}
						type="button"
						role="tab"
						aria-selected={active}
						onClick={() => onSelect(step.id)}
						className={chipClass(active)}
					>
						{LAUNCH_STEP_KIND_LABEL[step.step_kind]}
						<Pill
							tone={LAUNCH_STEP_STATUS_TONE[step.status]}
							size="xs"
							dot={step.status === 'running'}
						>
							{LAUNCH_STEP_STATUS_LABEL[step.status]}
						</Pill>
					</button>
				)
			})}
		</div>
	)
}
