import { ExecutionLogHeader } from '@/components/issue-detail/execution-log/ExecutionLogHeader'
import { ExecutionLogIdle } from '@/components/issue-detail/execution-log/ExecutionLogIdle'
import { ExecutionLogLoading } from '@/components/issue-detail/execution-log/ExecutionLogLoading'
import { FilesChangedSection } from '@/components/issue-detail/execution-log/FilesChangedSection'
import { NeedsBanner } from '@/components/issue-detail/execution-log/NeedsBanner'
import { PastRunsSection } from '@/components/issue-detail/execution-log/PastRunsSection'
import { PhaseStrip } from '@/components/issue-detail/execution-log/PhaseStrip'
import { RecentActivitySection } from '@/components/issue-detail/execution-log/RecentActivitySection'
import { useExecutionLogState } from '@/components/issue-detail/execution-log/useExecutionLogState'
import { WorktreeSection } from '@/components/issue-detail/execution-log/WorktreeSection'
import { deriveActivityRows, deriveChangedFiles, pickRepresentativeStep } from '@/lib/domain'
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
	const activityRows = deriveActivityRows(task.steps)
	const changedFiles = deriveChangedFiles(task.steps)

	return (
		<section
			aria-label="Execution log"
			className="overflow-hidden rounded-[10px] border border-border bg-surface"
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
			<RecentActivitySection rows={activityRows} runId={run?.id ?? null} />
			<FilesChangedSection files={changedFiles} runId={run?.id ?? null} />
			{state.kind === 'done' && state.worktree ? <WorktreeSection facts={state.worktree} /> : null}
			<PastRunsSection past={past} />
		</section>
	)
}
