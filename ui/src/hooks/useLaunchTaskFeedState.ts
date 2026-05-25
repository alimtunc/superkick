import {
	findBlockingContext,
	getDisposition,
	pickFinalStep,
	pickTerminalKind,
	TERMINAL_LAUNCH_TASK_STATUSES
} from '@/lib/domain'
import { launchTaskInterventionsQuery, runDetailQuery } from '@/lib/queries'
import type {
	BlockingContext,
	FailureClassification,
	LaunchTask,
	LaunchTaskIntervention,
	LaunchTaskStep,
	PullRequest,
	TerminalKind
} from '@/types'
import { useQuery } from '@tanstack/react-query'

interface UseLaunchTaskFeedStateResult {
	blocking: BlockingContext | null
	canRetry: boolean
	isTerminal: boolean
	terminalKind: TerminalKind | null
	hideCallout: boolean
	finalStep: LaunchTaskStep | null
	finalClassification: FailureClassification | null
	linkedRunId: string | null
	worktreePath: string | null
	branchName: string | null
	pr: PullRequest | null
	interventions: {
		delivered: LaunchTaskIntervention[]
		pending: LaunchTaskIntervention[]
	}
}

export function useLaunchTaskFeedState(
	task: LaunchTask,
	steps: readonly LaunchTaskStep[]
): UseLaunchTaskFeedStateResult {
	const blocking = findBlockingContext(task, [...steps])
	const isTerminal = TERMINAL_LAUNCH_TASK_STATUSES.has(task.status)
	const canRetry =
		task.status === 'needs_human' &&
		(blocking?.classification ? getDisposition(blocking.classification) === 'needs_human' : true)

	const linkedRunId = steps.find((s) => s.linked_run_id)?.linked_run_id ?? null
	const runDetail = useQuery(runDetailQuery(linkedRunId))
	const worktreePath = runDetail.data?.run.worktree_path ?? null
	const branchName = runDetail.data?.run.branch_name ?? null
	const pr = runDetail.data?.pr ?? null

	const finalStep = pickFinalStep(steps)
	const finalClassification = finalStep?.failure_classification ?? null
	const terminalKind = pickTerminalKind(task, finalClassification)
	const hideCallout = terminalKind === 'failure'

	const interventionsQuery = useQuery(launchTaskInterventionsQuery(task.id))
	const rows = interventionsQuery.data ?? []

	return {
		blocking,
		canRetry,
		isTerminal,
		terminalKind,
		hideCallout,
		finalStep,
		finalClassification,
		linkedRunId,
		worktreePath,
		branchName,
		pr,
		interventions: {
			delivered: rows.filter((i) => i.consumed_at != null),
			pending: rows.filter((i) => i.consumed_at == null)
		}
	}
}
