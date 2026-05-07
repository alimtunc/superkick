import { Pill } from '@/components/ui/pill'
import type { LaunchTaskStep } from '@/types'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'

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
		<div className="flex flex-wrap items-center gap-1.5 pl-6">
			{runId ? (
				<Link
					to="/runs/$runId"
					params={{ runId }}
					className="font-data inline-flex items-center gap-1 rounded border border-edge bg-slate-deep/60 px-2 py-0.5 text-[10px] text-silver transition-colors hover:border-mineral/40 hover:text-mineral"
				>
					Run
					<ArrowRight size={10} strokeWidth={1.75} aria-hidden="true" />
				</Link>
			) : null}
			{conversationId ? (
				<Pill tone="neutral" size="xs" title={conversationId}>
					Conversation
				</Pill>
			) : null}
			{orchestratorSessionId ? (
				<Pill tone="neutral" size="xs" title={orchestratorSessionId}>
					Orchestrator
				</Pill>
			) : null}
		</div>
	)
}
