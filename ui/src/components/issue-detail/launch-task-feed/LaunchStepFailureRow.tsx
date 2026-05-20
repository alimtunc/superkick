import { Evidence } from '@/components/launch/Evidence'
import { Pill } from '@/components/ui/pill'
import {
	getDisposition,
	LAUNCH_STEP_KIND_LABEL,
	LAUNCH_STEP_STATUS_LABEL,
	LAUNCH_STEP_STATUS_TONE
} from '@/lib/domain'
import { evidenceMetaForStep } from '@/lib/launch/evidence'
import type { FailureClassification, LaunchTaskStep } from '@/types'

import { LaunchStepFailureBody } from './LaunchStepFailureBody'

interface LaunchStepFailureRowProps {
	step: LaunchTaskStep
	classification: FailureClassification
}

export function LaunchStepFailureRow({ step, classification }: LaunchStepFailureRowProps) {
	const disposition = getDisposition(classification)
	return (
		<Evidence
			kind={disposition === 'failed' ? 'stuck' : 'ask'}
			title={`${LAUNCH_STEP_KIND_LABEL[step.step_kind]} · ${step.agent_name}`}
			meta={evidenceMetaForStep(step)}
			badge={
				<Pill tone={LAUNCH_STEP_STATUS_TONE[step.status]} size="sm" dot>
					{LAUNCH_STEP_STATUS_LABEL[step.status]}
				</Pill>
			}
			body={<LaunchStepFailureBody step={step} classification={classification} />}
		/>
	)
}
