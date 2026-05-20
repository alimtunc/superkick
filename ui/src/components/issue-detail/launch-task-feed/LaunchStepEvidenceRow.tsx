import { Evidence } from '@/components/launch/Evidence'
import { Pill } from '@/components/ui/pill'
import {
	LAUNCH_STEP_KIND_LABEL,
	LAUNCH_STEP_MUTED_STATUSES,
	LAUNCH_STEP_STATUS_LABEL,
	LAUNCH_STEP_STATUS_TONE
} from '@/lib/domain'
import { evidenceKindForStep, evidenceMetaForStep } from '@/lib/launch/evidence'
import type { LaunchTaskStep } from '@/types'

import { LaunchStepLinks } from './LaunchStepLinks'

interface LaunchStepEvidenceRowProps {
	step: LaunchTaskStep
}

export function LaunchStepEvidenceRow({ step }: LaunchStepEvidenceRowProps) {
	const summary = step.summary?.trim()
	const showLinks = step.linked_run_id || step.linked_conversation_id || step.linked_orchestrator_session_id
	const body =
		summary || showLinks ? (
			<>
				{summary ? <p className="mb-2 leading-normal">{summary}</p> : null}
				{showLinks ? <LaunchStepLinks step={step} /> : null}
			</>
		) : null

	return (
		<Evidence
			kind={evidenceKindForStep(step)}
			title={`${LAUNCH_STEP_KIND_LABEL[step.step_kind]} · ${step.agent_name}`}
			meta={evidenceMetaForStep(step)}
			badge={
				<Pill
					tone={LAUNCH_STEP_STATUS_TONE[step.status]}
					size="sm"
					dot
					pulse={step.status === 'running'}
				>
					{LAUNCH_STEP_STATUS_LABEL[step.status]}
				</Pill>
			}
			muted={LAUNCH_STEP_MUTED_STATUSES.has(step.status)}
			body={body}
		/>
	)
}
