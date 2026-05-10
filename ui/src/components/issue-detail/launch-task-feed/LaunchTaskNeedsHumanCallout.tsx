import { toneAccentClass, toneTextClass } from '@/lib/domain'
import { useWorkspaceChatStore } from '@/stores/workspaceChat'
import type { LaunchTaskStep } from '@/types'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'

import { LaunchTaskRetryButton } from './LaunchTaskRetryButton'

interface LaunchTaskNeedsHumanCalloutProps {
	linearIssueId: string
	taskId: string
	headline: string
	hint: string
	blockingStep: LaunchTaskStep | null
	canRetry: boolean
}

export function LaunchTaskNeedsHumanCallout({
	linearIssueId,
	taskId,
	headline,
	hint,
	blockingStep,
	canRetry
}: LaunchTaskNeedsHumanCalloutProps) {
	const openChat = useWorkspaceChatStore((s) => s.openChat)
	const linkedRunId = blockingStep?.linked_run_id ?? null

	const containerClass = `mb-4 rounded-md border px-4 py-3 ${toneAccentClass.attention}`

	const headlineNode = (
		<div className="flex flex-col">
			<span className={`text-[13px] font-medium ${toneTextClass.attention}`}>{headline}</span>
			<span className="font-data text-[11px] text-silver">{hint}</span>
		</div>
	)

	const ctaLabel = linkedRunId ? 'Open run' : 'Open chat'
	const ctaClass = `font-data inline-flex items-center gap-1 text-[11px] ${toneTextClass.attention} hover:underline focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:outline-none`

	const cta = linkedRunId ? (
		<Link to="/runs/$runId" params={{ runId: linkedRunId }} className={ctaClass}>
			{ctaLabel}
			<ArrowRight size={12} strokeWidth={1.75} aria-hidden="true" />
		</Link>
	) : (
		<button type="button" onClick={openChat} className={ctaClass}>
			{ctaLabel}
			<ArrowRight size={12} strokeWidth={1.75} aria-hidden="true" />
		</button>
	)

	return (
		<div className={containerClass}>
			<div className="flex items-center justify-between gap-3">
				{headlineNode}
				<div className="flex items-center gap-2">
					{canRetry ? (
						<LaunchTaskRetryButton linearIssueId={linearIssueId} taskId={taskId} />
					) : null}
					{cta}
				</div>
			</div>
		</div>
	)
}
