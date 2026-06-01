import { LaunchTaskCompletionSummary } from '@/components/issue-detail/launch-task-feed/LaunchTaskCompletionSummary'
import { WorktreeActions } from '@/components/workspace/WorktreeActions'
import type { FailureClassification, LaunchTask, LaunchTaskStep, TerminalKind } from '@/types'

interface LaunchTaskTerminalSectionProps {
	task: LaunchTask
	terminalKind: TerminalKind | null
	finalStep: LaunchTaskStep | null
	finalClassification: FailureClassification | null
	linkedRunId: string | null
	worktreePath: string | null
	branchName: string | null
}

export function LaunchTaskTerminalSection({
	task,
	terminalKind,
	finalStep,
	finalClassification,
	linkedRunId,
	worktreePath,
	branchName
}: LaunchTaskTerminalSectionProps) {
	if (terminalKind) {
		return (
			<LaunchTaskCompletionSummary
				kind={terminalKind}
				task={task}
				finalStep={finalStep}
				classification={finalClassification}
				linkedRunId={linkedRunId}
				worktreePath={worktreePath}
				branchName={branchName}
			/>
		)
	}
	if (linkedRunId) {
		return <WorktreeActions runId={linkedRunId} worktreePath={worktreePath} branchName={branchName} />
	}
	return null
}
