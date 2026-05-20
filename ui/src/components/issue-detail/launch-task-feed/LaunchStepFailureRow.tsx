import { Evidence } from '@/components/launch/Evidence'
import { Pill } from '@/components/ui/pill'
import {
	getDisposition,
	getFailureCopy,
	LAUNCH_STEP_KIND_LABEL,
	LAUNCH_STEP_STATUS_LABEL,
	LAUNCH_STEP_STATUS_TONE,
	providerLabel
} from '@/lib/domain'
import { evidenceMetaForStep } from '@/lib/launch/evidence'
import type { FailureClassification, LaunchTaskStep } from '@/types'

import { LaunchStepLinks } from './LaunchStepLinks'

interface LaunchStepFailureRowProps {
	step: LaunchTaskStep
	classification: FailureClassification
}

export function LaunchStepFailureRow({ step, classification }: LaunchStepFailureRowProps) {
	const copy = getFailureCopy(classification)
	const disposition = getDisposition(classification)
	const showLinks = step.linked_run_id || step.linked_conversation_id || step.linked_orchestrator_session_id

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
			body={
				<div className="flex flex-col gap-2">
					<p className="leading-normal">
						<span className="font-medium text-fg">{copy.headline}.</span>{' '}
						<span className="text-fg-muted">{copy.hint}</span>
					</p>
					<FailureChips classification={classification} />
					<FailureDetail detail={copy.detail} />
					{showLinks ? <LaunchStepLinks step={step} /> : null}
				</div>
			}
		/>
	)
}

interface FailureChipsProps {
	classification: FailureClassification
}

function FailureChips({ classification }: FailureChipsProps) {
	switch (classification.kind) {
		case 'auth_required':
			return (
				<div className="flex flex-wrap items-center gap-1.5">
					<Pill tone="warn" size="sm">
						{providerLabel[classification.provider]}
					</Pill>
				</div>
			)
		case 'quota_exceeded':
			return (
				<div className="flex flex-wrap items-center gap-1.5">
					<Pill tone="warn" size="sm">
						{providerLabel[classification.provider]}
					</Pill>
					{classification.reset_at ? (
						<span className="font-mono text-[11px] text-fg-dim">
							resets at {classification.reset_at}
						</span>
					) : null}
				</div>
			)
		case 'cli_missing':
			return (
				<div className="flex flex-wrap items-center gap-1.5">
					<Pill tone="danger" size="sm" mono>
						{classification.binary}
					</Pill>
				</div>
			)
		default:
			return null
	}
}

interface FailureDetailProps {
	detail: string | undefined
}

function FailureDetail({ detail }: FailureDetailProps) {
	if (!detail) return null
	return (
		<pre className="overflow-x-auto rounded-md border border-border bg-raised px-2.5 py-2 font-mono text-[11px] leading-snug whitespace-pre-wrap text-fg-muted">
			{detail}
		</pre>
	)
}
