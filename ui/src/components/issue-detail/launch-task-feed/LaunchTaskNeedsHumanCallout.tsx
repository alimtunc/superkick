import { useWorkspaceChatStore } from '@/stores/workspaceChat'
import type { LaunchTaskStep } from '@/types'
import { Icon } from '@/ui/Icon'
import { Link } from '@tanstack/react-router'

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

	const ctaLabel = linkedRunId ? 'Open run' : 'Open chat'
	const ctaClass =
		'inline-flex items-center gap-1 font-mono text-[11.5px] text-warn hover:underline focus-visible:ring-2 focus-visible:ring-warn/40 focus-visible:outline-none'

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
		<div className="mb-4 rounded-md border border-warn/40 bg-warn-soft px-3.5 py-3">
			<div className="flex items-center justify-between gap-3">
				<div className="flex flex-col">
					<span className="text-[13px] font-medium text-warn">{headline}</span>
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
