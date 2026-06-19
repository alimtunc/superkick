import type { LaunchTaskStep } from '@/types'

import { LaunchStepLinks } from './LaunchStepLinks'

interface StepEvidenceListProps {
	step: LaunchTaskStep
	showSummary?: boolean
}

export function StepEvidenceList({ step, showSummary = true }: StepEvidenceListProps) {
	const summary = showSummary ? step.summary?.trim() : null
	const hasLinks = Boolean(
		step.linked_run_id || step.linked_conversation_id || step.linked_orchestrator_session_id
	)

	if (!summary && !hasLinks) return null

	return (
		<div className="flex flex-col gap-2">
			{summary ? <p className="leading-normal">{summary}</p> : null}
			{hasLinks ? <LaunchStepLinks step={step} /> : null}
		</div>
	)
}
