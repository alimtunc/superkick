import { InspectorSection } from '@/components/ui/inspector-section'
import { Pill } from '@/components/ui/pill'
import {
	LAUNCH_STEP_KIND_LABEL,
	LAUNCH_STEP_STATUS_LABEL,
	LAUNCH_STEP_STATUS_TONE,
	resolveProviderLabel
} from '@/lib/domain'
import { isStepActive } from '@/lib/launch/stepTimeline'
import type { LaunchTask, LaunchTaskStep } from '@/types'

interface NowActiveStepProps {
	step: LaunchTaskStep | null
	task: LaunchTask
}

export function NowActiveStep({ step, task }: NowActiveStepProps) {
	if (!step) {
		return (
			<InspectorSection label="Active step">
				<p className="mt-2 text-[12.5px] text-fg-muted">
					No active step. The task has either completed or has not started.
				</p>
			</InspectorSection>
		)
	}

	const active = isStepActive(step, task)
	const tone = LAUNCH_STEP_STATUS_TONE[step.status]
	const provider = resolveProviderLabel(step.provider)
	const meta = provider ? `${step.agent_name} · ${provider}` : step.agent_name

	return (
		<InspectorSection label="Active step">
			<div className="mt-2 rounded-md border border-edge bg-canvas/40 px-3 py-2.5">
				<div className="flex items-center gap-2">
					<span className="text-[13px] font-medium text-fg">
						{LAUNCH_STEP_KIND_LABEL[step.step_kind]}
					</span>
					<Pill tone={tone} size="xs" dot pulse={active}>
						{LAUNCH_STEP_STATUS_LABEL[step.status]}
					</Pill>
				</div>
				<p className="font-data mt-1 text-[11.5px] text-fg-muted">{meta}</p>
				{step.summary ? (
					<p className="mt-2 text-[12px] leading-relaxed text-fg-muted">{step.summary}</p>
				) : null}
			</div>
		</InspectorSection>
	)
}
