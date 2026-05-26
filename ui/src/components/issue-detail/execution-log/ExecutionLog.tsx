import { ExecutionLogHeader } from '@/components/issue-detail/execution-log/ExecutionLogHeader'
import { ExecutionLogIdle } from '@/components/issue-detail/execution-log/ExecutionLogIdle'
import { ExecutionLogLoading } from '@/components/issue-detail/execution-log/ExecutionLogLoading'
import { NeedsBanner } from '@/components/issue-detail/execution-log/NeedsBanner'
import { PastRunsSection } from '@/components/issue-detail/execution-log/PastRunsSection'
import { PhaseStrip } from '@/components/issue-detail/execution-log/PhaseStrip'
import { useExecutionLogState } from '@/components/issue-detail/execution-log/useExecutionLogState'
import { WorktreeMini } from '@/components/issue-detail/execution-log/WorktreeMini'
import { pickRepresentativeStep } from '@/lib/domain'
import type { IssueDetailResponse } from '@/types'

interface ExecutionLogProps {
	issue: IssueDetailResponse
}

export function ExecutionLog({ issue }: ExecutionLogProps) {
	const { state, blocking, loading } = useExecutionLogState(issue)

	if (state.kind === 'idle') {
		if (loading) return <ExecutionLogLoading />
		return <ExecutionLogIdle issueIdentifier={issue.identifier} />
	}

	const { task, run, phases, past } = state
	const currentStep = pickRepresentativeStep(task.steps)

	return (
		<section
			aria-label="Execution log"
			className="flex flex-col gap-3 rounded-md border border-border bg-canvas px-3.5 py-3"
		>
			<ExecutionLogHeader kind={state.kind} currentStep={currentStep} run={run} />
			{state.kind === 'needs' && blocking ? (
				<NeedsBanner
					linearIssueId={issue.identifier}
					taskId={task.task.id}
					linkedRunId={run?.id ?? null}
					blocking={blocking}
				/>
			) : null}
			<PhaseStrip phases={phases} />
			{state.kind === 'done' && state.worktree ? <WorktreeMini facts={state.worktree} /> : null}
			<PastRunsSection past={past} />
		</section>
	)
}
