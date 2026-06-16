import { Icon, Pill } from '@/components/primitives'
import type { LaunchTaskStep } from '@/types'
import { Link } from '@tanstack/react-router'

interface LaunchStepLinksProps {
	step: LaunchTaskStep
}

export function LaunchStepLinks({ step }: LaunchStepLinksProps) {
	const runId = step.linked_run_id ?? null
	const conversationId = step.linked_conversation_id ?? null
	const orchestratorSessionId = step.linked_orchestrator_session_id ?? null

	const hasAny = Boolean(runId || conversationId || orchestratorSessionId)
	if (!hasAny) return null

	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{runId ? (
				<Link
					to="/runs/$runId"
					params={{ runId }}
					className="inline-flex items-center gap-1 rounded-md border border-border bg-raised px-2 py-0.5 font-mono text-[10.5px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
				>
					Run
					<Icon name="arrowRight" size={10} />
				</Link>
			) : null}
			{conversationId ? (
				<span title={conversationId} className="inline-flex">
					<Pill tone="neutral" size="sm" mono>
						Conversation
					</Pill>
				</span>
			) : null}
			{orchestratorSessionId ? (
				<span title={orchestratorSessionId} className="inline-flex">
					<Pill tone="neutral" size="sm" mono>
						Orchestrator
					</Pill>
				</span>
			) : null}
		</div>
	)
}
