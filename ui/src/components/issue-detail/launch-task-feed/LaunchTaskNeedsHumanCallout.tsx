import { getDisposition } from '@/lib/domain'
import { cn } from '@/lib/utils'
import { useWorkspaceChatStore } from '@/stores/workspaceChat'
import type { FailureClassification, LaunchTaskStep } from '@/types'
import { Icon } from '@/ui/Icon'
import { Link } from '@tanstack/react-router'

import { LaunchTaskRetryButton } from './LaunchTaskRetryButton'

interface LaunchTaskNeedsHumanCalloutProps {
	linearIssueId: string
	taskId: string
	headline: string
	hint: string
	blockingStep: LaunchTaskStep | null
	classification: FailureClassification | null
	canRetry: boolean
}

export function LaunchTaskNeedsHumanCallout({
	linearIssueId,
	taskId,
	headline,
	hint,
	blockingStep,
	classification,
	canRetry
}: LaunchTaskNeedsHumanCalloutProps) {
	const openChat = useWorkspaceChatStore((s) => s.openChat)
	const linkedRunId = blockingStep?.linked_run_id ?? null
	const isTerminal = classification ? getDisposition(classification) === 'failed' : false

	const containerClass = isTerminal
		? 'mb-4 rounded-md border border-danger/40 bg-danger-soft px-3.5 py-3'
		: 'mb-4 rounded-md border border-warn/40 bg-warn-soft px-3.5 py-3'
	const headlineClass = isTerminal
		? 'text-[13px] font-medium text-danger'
		: 'text-[13px] font-medium text-warn'
	const ctaClass = cn(
		'inline-flex items-center gap-1 font-mono text-[11.5px] hover:underline focus-visible:ring-2 focus-visible:outline-none',
		isTerminal ? 'text-danger focus-visible:ring-danger/40' : 'text-warn focus-visible:ring-warn/40'
	)

	const ctaLabel = linkedRunId ? 'Open run' : 'Open chat'
	const cta = linkedRunId ? (
		<Link to="/runs/$runId" params={{ runId: linkedRunId }} className={ctaClass}>
			{ctaLabel}
			<Icon name="arrowRight" size={12} />
		</Link>
	) : (
		<button type="button" onClick={openChat} className={ctaClass}>
			{ctaLabel}
			<Icon name="arrowRight" size={12} />
		</button>
	)

	return (
		<div className={containerClass}>
			<div className="flex items-center justify-between gap-3">
				<div className="flex flex-col">
					<span className={headlineClass}>{headline}</span>
					<span className="font-mono text-[11.5px] text-fg-muted">{hint}</span>
				</div>
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
