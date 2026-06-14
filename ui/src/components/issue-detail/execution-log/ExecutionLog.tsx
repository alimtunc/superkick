import { ExecutionLogHeader } from '@/components/issue-detail/execution-log/ExecutionLogHeader'
import { ExecutionLogIdle } from '@/components/issue-detail/execution-log/ExecutionLogIdle'
import { ExecutionLogLoading } from '@/components/issue-detail/execution-log/ExecutionLogLoading'
import { FilesChangedSection } from '@/components/issue-detail/execution-log/FilesChangedSection'
import { NeedsBanner } from '@/components/issue-detail/execution-log/NeedsBanner'
import { PastRunsSection } from '@/components/issue-detail/execution-log/PastRunsSection'
import { PhaseStrip } from '@/components/issue-detail/execution-log/PhaseStrip'
import { RecentActivitySection } from '@/components/issue-detail/execution-log/RecentActivitySection'
import { ReviewReadySection } from '@/components/issue-detail/execution-log/ReviewReadySection'
import { RunOnlyCard } from '@/components/issue-detail/execution-log/RunOnlyCard'
import { useExecutionLogState } from '@/components/issue-detail/execution-log/useExecutionLogState'
import { WorktreeSection } from '@/components/issue-detail/execution-log/WorktreeSection'
import { LaunchTaskCancelButton } from '@/components/issue-detail/launch-task-feed/LaunchTaskCancelButton'
import { deriveActivityRows, deriveChangedFiles, pickRepresentativeStep } from '@/lib/domain'
import type { IssueDetailResponse } from '@/types'

interface ExecutionLogProps {
	issue: IssueDetailResponse
}

export function ExecutionLog({ issue }: ExecutionLogProps) {
	const { state, blocking, loading } = useExecutionLogState(issue)

	if (loading && (state.kind === 'idle' || state.kind === 'run_only')) {
		return <ExecutionLogLoading />
	}

	if (state.kind === 'idle') return <ExecutionLogIdle issue={issue} />
	if (state.kind === 'run_only') return <RunOnlyCard run={state.run} />

	const { task, run, phases, past } = state
	const currentStep = pickRepresentativeStep(task.steps)
	const activityRows = deriveActivityRows(task.steps)
	const changedFiles = deriveChangedFiles(task.steps)

	return (
		<>
			{state.kind === 'done' ? (
				<ReviewReadySection
					issue={issue}
					task={task}
					run={run}
					runDetail={state.runDetail}
					worktree={state.worktree}
				/>
			) : null}
			<section aria-label="Execution log" className="execlog">
				<ExecutionLogHeader
					kind={state.kind}
					currentStep={currentStep}
					run={run}
					cancel={
						state.kind === 'running' ? (
							<LaunchTaskCancelButton
								linearIssueId={issue.identifier}
								taskId={task.task.id}
								linkedRunId={run?.id}
							/>
						) : null
					}
				/>
				<PhaseStrip phases={phases} />
				<RecentActivitySection rows={activityRows} runId={run?.id ?? null} />
				<FilesChangedSection files={changedFiles} runId={run?.id ?? null} />
				{state.kind === 'done' && state.worktree ? <WorktreeSection facts={state.worktree} /> : null}
				<PastRunsSection past={past} linkedRuns={issue.linked_runs} />
			</section>
			{state.kind === 'needs' && blocking ? (
				<NeedsBanner
					linearIssueId={issue.identifier}
					taskId={task.task.id}
					linkedRunId={run?.id ?? null}
					blocking={blocking}
				/>
			) : null}
		</>
	)
}
