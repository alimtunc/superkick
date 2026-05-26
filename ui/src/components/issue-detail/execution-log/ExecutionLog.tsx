import { ExecActivityRow } from '@/components/issue-detail/execution-log/ExecActivityRow'
import { ExecSection } from '@/components/issue-detail/execution-log/ExecSection'
import { ExecutionLogHeader } from '@/components/issue-detail/execution-log/ExecutionLogHeader'
import { ExecutionLogIdle } from '@/components/issue-detail/execution-log/ExecutionLogIdle'
import { ExecutionLogLoading } from '@/components/issue-detail/execution-log/ExecutionLogLoading'
import { NeedsBanner } from '@/components/issue-detail/execution-log/NeedsBanner'
import { PastRunsSection } from '@/components/issue-detail/execution-log/PastRunsSection'
import { PhaseStrip } from '@/components/issue-detail/execution-log/PhaseStrip'
import { useExecutionLogState } from '@/components/issue-detail/execution-log/useExecutionLogState'
import { WorktreeMini } from '@/components/issue-detail/execution-log/WorktreeMini'
import type { ExecActivity, IssueDetailResponse, LaunchTaskStep } from '@/types'

const MAX_INLINE_ACTIVITY = 3

interface ExecutionLogProps {
	issue: IssueDetailResponse
}

function currentStepFor(steps: readonly LaunchTaskStep[]): LaunchTaskStep | null {
	return steps.find((s) => s.status === 'running' || s.status === 'needs_human') ?? null
}

function recentInlineActivity(activity: readonly ExecActivity[]): ExecActivity[] {
	return activity.slice(-MAX_INLINE_ACTIVITY)
}

export function ExecutionLog({ issue }: ExecutionLogProps) {
	const { state, blocking, loading } = useExecutionLogState(issue)

	if (state.kind === 'idle') {
		if (loading) return <ExecutionLogLoading />
		return <ExecutionLogIdle issueIdentifier={issue.identifier} />
	}

	const { task, run, phases, activity, past } = state
	const currentStep = currentStepFor(task.steps)
	const inlineActivity = recentInlineActivity(activity)

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
			{inlineActivity.length > 0 ? (
				<ExecSection
					id="exec-recent-activity"
					label="Recent activity"
					count={activity.length}
					collapsible={false}
				>
					<ul>
						{inlineActivity.map((row) => (
							<li key={row.id}>
								<ExecActivityRow activity={row} />
							</li>
						))}
					</ul>
				</ExecSection>
			) : null}
			{state.kind === 'done' && state.worktree ? <WorktreeMini facts={state.worktree} /> : null}
			<PastRunsSection past={past} />
		</section>
	)
}
