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

	const ctaClass = cn(
		'inline-flex items-center gap-1 font-mono text-[11.5px] hover:underline focus-visible:outline-none',
		isTerminal ? 'text-danger' : 'text-[var(--status-needs)]'
	)
	const ctaLabel = linkedRunId ? 'Open run' : 'Open chat'
	const cta = linkedRunId ? (
		<Link to="/runs/$runId" params={{ runId: linkedRunId }} className={ctaClass}>
			{ctaLabel}
			<Icon name="arrowRight" size={12} className="ic" />
		</Link>
	) : (
		<button type="button" onClick={openChat} className={ctaClass}>
			{ctaLabel}
			<Icon name="arrowRight" size={12} className="ic" />
		</button>
	)

	return (
		<div
			className={cn('opbanner', isTerminal ? 'opbanner--danger' : 'opbanner--needs')}
			style={
				isTerminal ? { background: 'var(--danger-soft)', borderColor: 'var(--danger)' } : undefined
			}
		>
			<span className="opbanner__icon" style={isTerminal ? { color: 'var(--danger)' } : undefined}>
				<Icon name="alert" size={16} className="ic" />
			</span>
			<div className="opbanner__body">
				<p className="opbanner__title">{headline}</p>
				<p className="opbanner__q font-mono">{hint}</p>
				<div className="opbanner__actions">
					{canRetry ? (
						<LaunchTaskRetryButton linearIssueId={linearIssueId} taskId={taskId} />
					) : null}
					{cta}
				</div>
			</div>
		</div>
	)
}
