import { Evidence } from '@/components/launch/Evidence'
import { Pill } from '@/components/ui/pill'
import {
	LAUNCH_STEP_KIND_LABEL,
	LAUNCH_STEP_MUTED_STATUSES,
	LAUNCH_STEP_STATUS_LABEL,
	LAUNCH_STEP_STATUS_TONE
} from '@/lib/domain'
import { evidenceKindForStep, evidenceMetaForStep } from '@/lib/launch/evidence'
import { isStepActive } from '@/lib/launch/stepTimeline'
import type { LaunchTask, LaunchTaskStep } from '@/types'

import { LaunchStepFailureBody } from './LaunchStepFailureBody'
import { StepEvidenceList } from './StepEvidenceList'
import { StepSummaryCard } from './StepSummaryCard'

interface StepTimelineRowProps {
	step: LaunchTaskStep
	task: LaunchTask
}

export function StepTimelineRow({ step, task }: StepTimelineRowProps) {
	const classification = step.failure_classification ?? null
	const structured = step.structured_result ?? null
	const active = isStepActive(step, task)
	const muted = !active && LAUNCH_STEP_MUTED_STATUSES.has(step.status)

	const hasFailure = classification !== null
	const hasStructured = structured !== null

	const body =
		hasFailure || hasStructured ? (
			<div className="flex flex-col gap-2.5">
				{hasFailure ? <LaunchStepFailureBody step={step} classification={classification} /> : null}
				{hasStructured ? <StepSummaryCard result={structured} status={step.status} /> : null}
				{hasStructured && !hasFailure ? <StepEvidenceList step={step} showSummary={false} /> : null}
			</div>
		) : (
			<StepEvidenceList step={step} />
		)

	return (
		<Evidence
			kind={evidenceKindForStep(step)}
			title={`${LAUNCH_STEP_KIND_LABEL[step.step_kind]} · ${step.agent_name}`}
			meta={evidenceMetaForStep(step)}
			badge={
				<Pill tone={LAUNCH_STEP_STATUS_TONE[step.status]} size="sm" dot pulse={active}>
					{LAUNCH_STEP_STATUS_LABEL[step.status]}
				</Pill>
			}
			muted={muted}
			body={body}
		/>
	)
}
