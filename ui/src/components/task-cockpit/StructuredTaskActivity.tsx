import { StructuredActivityList } from '@/components/run-tabs/StructuredActivityList'
import { PhaseLine } from '@/components/task-cockpit/PhaseLine'
import { LAUNCH_STEP_KIND_LABEL } from '@/lib/domain'
import type { LaunchTaskStep, RunEvent } from '@/types'
import { ChevronRight } from 'lucide-react'

export function StructuredTaskActivity({
	steps,
	runEvents
}: {
	steps: readonly LaunchTaskStep[]
	runEvents: RunEvent[]
}) {
	const plan = steps.find((step) => step.step_kind === 'plan')
	const implement = steps.find((step) => step.step_kind === 'implement')
	const review = steps.find((step) => step.step_kind === 'review')
	const done = steps.filter((step) => step.status === 'completed').length
	const total = steps.length

	return (
		<div className="space-y-4">
			{plan ? <PhaseLine step={plan} /> : null}
			{implement ? (
				<section>
					<div className="mb-3 flex items-center gap-2 rounded-md bg-raised px-3 py-2">
						<ChevronRight
							size={13}
							strokeWidth={1.85}
							className="text-fg-dim"
							aria-hidden="true"
						/>
						<span className="font-data text-[11px] font-semibold tracking-wider text-accent uppercase">
							{LAUNCH_STEP_KIND_LABEL[implement.step_kind]}
						</span>
						<span className="font-data text-[11px] text-fg-dim">
							{done} of {total} steps
						</span>
					</div>
					<StructuredActivityList events={runEvents} className="pl-3" />
				</section>
			) : null}
			{review ? <PhaseLine step={review} /> : null}
		</div>
	)
}
