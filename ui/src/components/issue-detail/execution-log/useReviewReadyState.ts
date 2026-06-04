import { useMemo } from 'react'

import { getFailureCopy, pickFinalStep, pickTerminalKind } from '@/lib/domain'
import type { LaunchTaskWithSteps, LinkedPrSummary, LinkedRunSummary, Run, WorktreeFacts } from '@/types'

interface UseReviewReadyStateInput {
	task: LaunchTaskWithSteps
	run: LinkedRunSummary | null
	runDetail: Run | null
	worktree: WorktreeFacts | null
}

export interface ReviewReadyState {
	isSuccess: boolean
	headline: string
	summary: string
	changedFiles: string[]
	autoResume: number
	failureHint: string | null
	pr: LinkedPrSummary | null
	runId: string | null
	baseBranch: string | null
	branchName: string | null
	hasWorktree: boolean
	canReview: boolean
	canShip: boolean
}

export function useReviewReadyState({
	task,
	run,
	runDetail,
	worktree
}: UseReviewReadyStateInput): ReviewReadyState {
	const finalStep = pickFinalStep(task.steps)
	const classification = finalStep?.failure_classification ?? null
	const terminalKind = pickTerminalKind(task.task, classification)
	const isSuccess = terminalKind === 'success'

	const runId = run?.id ?? null
	const worktreePath = worktree?.worktreePath ?? runDetail?.worktree_path ?? null
	const branchName = worktree?.branch ?? runDetail?.branch_name ?? null
	const baseBranch = runDetail?.base_branch ?? null
	const hasWorktree = worktreePath !== null
	const pr = worktree?.pr ?? null

	const result = finalStep?.structured_result ?? null
	const summary = (result?.summary || finalStep?.summary || task.task.summary || '').trim()
	const changedFiles = useMemo(() => result?.changed_files ?? [], [result])
	const autoResume = finalStep?.auto_resume_count ?? 0

	const failureCopy = !isSuccess && classification ? getFailureCopy(classification, autoResume) : null
	const failureHeadline =
		failureCopy?.headline ??
		(task.task.status === 'cancelled' ? 'Launch task cancelled' : 'Launch task failed')
	const successHeadline = pr ? 'In review' : 'Ready for review'
	const headline = isSuccess ? successHeadline : failureHeadline

	const canReview = runId !== null && hasWorktree
	// Once a PR exists the run is shipped — surface the PR instead of Ship.
	const canShip = isSuccess && canReview && pr === null

	return {
		isSuccess,
		headline,
		summary,
		changedFiles,
		autoResume,
		failureHint: failureCopy?.hint ?? null,
		pr,
		runId,
		baseBranch,
		branchName,
		hasWorktree,
		canReview,
		canShip
	}
}
