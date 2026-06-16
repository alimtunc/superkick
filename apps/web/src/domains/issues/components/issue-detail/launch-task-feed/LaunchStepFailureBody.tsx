import type { ReactNode } from 'react'

import { Pill } from '@/components/primitives'
import { getFailureCopy, providerLabel } from '@/lib/domain'
import type { FailureClassification, LaunchTaskStep } from '@/types'

import { LaunchStepLinks } from './LaunchStepLinks'

interface LaunchStepFailureBodyProps {
	step: LaunchTaskStep
	classification: FailureClassification
}

export function LaunchStepFailureBody({ step, classification }: LaunchStepFailureBodyProps) {
	const copy = getFailureCopy(classification, step.auto_resume_count)
	const showLinks = Boolean(
		step.linked_run_id || step.linked_conversation_id || step.linked_orchestrator_session_id
	)

	return (
		<div className="flex flex-col gap-2">
			<p className="leading-normal">
				<span className="font-medium text-fg">{copy.headline}.</span>{' '}
				<span className="text-fg-muted">{copy.hint}</span>
			</p>
			<FailureChips classification={classification} />
			<FailureDetail detail={copy.detail} />
			{showLinks ? <LaunchStepLinks step={step} /> : null}
		</div>
	)
}

interface FailureChipsProps {
	classification: FailureClassification
}

function FailureChips({ classification }: FailureChipsProps) {
	const chips = chipsFor(classification)
	if (chips === null) return null
	return <div className="flex flex-wrap items-center gap-1.5">{chips}</div>
}

function chipsFor(classification: FailureClassification): ReactNode | null {
	switch (classification.kind) {
		case 'auth_required':
			return (
				<Pill tone="warn" size="sm">
					{providerLabel[classification.provider]}
				</Pill>
			)
		case 'quota_exceeded':
			return (
				<>
					<Pill tone="warn" size="sm">
						{providerLabel[classification.provider]}
					</Pill>
					{classification.reset_at ? (
						<span className="font-mono text-[11px] text-fg-dim">
							resets at {classification.reset_at}
						</span>
					) : null}
				</>
			)
		case 'cli_missing':
			return (
				<Pill tone="danger" size="sm" mono>
					{classification.binary}
				</Pill>
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
