import { RunBudgetCard } from '@/components/run-detail/RunBudgetCard'
import { RunDetailsGrid } from '@/components/run-detail/RunDetailsGrid'
import { RunHero } from '@/components/run-detail/RunHero'
import type { AgentSession, AttentionRequest, Interrupt, PullRequest, Run, RunStep } from '@/types'

const NO_INTERRUPTS: Interrupt[] = []

interface ContextTabProps {
	run: Run
	pr: PullRequest | null
	steps: RunStep[]
	sessions: AgentSession[]
	attentionRequests: AttentionRequest[]
	interrupts?: Interrupt[]
	refTime: number
}

export function ContextTab({
	run,
	pr,
	steps,
	sessions,
	attentionRequests,
	interrupts = NO_INTERRUPTS,
	refTime
}: ContextTabProps) {
	return (
		<div className="space-y-4 px-4 py-4">
			<RunHero
				run={run}
				pr={pr}
				sessions={sessions}
				attentionRequests={attentionRequests}
				interrupts={interrupts}
				refTime={refTime}
			/>
			<RunBudgetCard run={run} steps={steps} refTime={refTime} />
			<div>
				<div className="font-data mb-2 text-[10px] tracking-[0.08em] text-fg-dim uppercase">
					Workspace
				</div>
				<RunDetailsGrid run={run} pr={pr} />
			</div>
		</div>
	)
}
