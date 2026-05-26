import { useMemo } from 'react'

import { useIssueLaunchTasks } from '@/hooks/useIssueLaunchTasks'
import {
	deriveActivity,
	derivePhases,
	findBlockingContext,
	isActiveRun,
	pickLatestRun,
	pickLinkedRunId,
	TERMINAL_LAUNCH_TASK_STATUSES
} from '@/lib/domain'
import { runDetailQuery } from '@/lib/queries'
import type {
	BlockingContext,
	ExecutionLogState,
	IssueDetailResponse,
	LinkedPrSummary,
	PullRequest
} from '@/types'
import { useQuery } from '@tanstack/react-query'

interface UseExecutionLogStateResult {
	state: ExecutionLogState
	blocking: BlockingContext | null
	loading: boolean
}

function pickPrSummary(linkedPr: LinkedPrSummary | null, pr: PullRequest | null): LinkedPrSummary | null {
	if (linkedPr) return linkedPr
	if (!pr) return null
	return { number: pr.number, url: pr.url, state: pr.state, merged_at: pr.merged_at }
}

export function useExecutionLogState(issue: IssueDetailResponse): UseExecutionLogStateResult {
	const { tasksWithSteps, loading } = useIssueLaunchTasks(issue.identifier)

	const latest = tasksWithSteps.at(0) ?? null
	const past = useMemo(() => tasksWithSteps.slice(1), [tasksWithSteps])

	const blocking = useMemo(() => {
		if (!latest) return null
		return findBlockingContext(latest.task, latest.steps)
	}, [latest])

	const isLatestTerminal = latest ? TERMINAL_LAUNCH_TASK_STATUSES.has(latest.task.status) : false
	const isLatestDone = isLatestTerminal && !blocking

	const doneRunId = isLatestDone && latest ? pickLinkedRunId(latest.steps) : null
	const runDetail = useQuery(runDetailQuery(doneRunId))

	const state = useMemo<ExecutionLogState>(() => {
		if (!latest) return { kind: 'idle' }

		const activeRun = issue.linked_runs.find(isActiveRun) ?? null
		const linkedRunId = pickLinkedRunId(latest.steps)
		const linkedRun = linkedRunId
			? (issue.linked_runs.find((r) => r.id === linkedRunId) ?? null)
			: (activeRun ?? pickLatestRun(issue.linked_runs))

		const phases = derivePhases(latest.steps)
		const activity = deriveActivity(latest.steps)

		if (blocking) {
			return { kind: 'needs', task: latest, run: linkedRun, phases, activity, past }
		}

		if (!isLatestTerminal) {
			return { kind: 'running', task: latest, run: linkedRun, phases, activity, past }
		}

		const fullRun = runDetail.data?.run ?? null
		const prSummary = pickPrSummary(linkedRun?.pr ?? null, runDetail.data?.pr ?? null)

		const worktree =
			fullRun || prSummary
				? {
						branch: fullRun?.branch_name ?? null,
						worktreePath: fullRun?.worktree_path ?? null,
						pr: prSummary
					}
				: null

		return {
			kind: 'done',
			task: latest,
			run: linkedRun,
			runDetail: fullRun,
			phases,
			activity,
			past,
			worktree
		}
	}, [latest, blocking, isLatestTerminal, issue, past, runDetail.data])

	return { state, blocking, loading }
}
