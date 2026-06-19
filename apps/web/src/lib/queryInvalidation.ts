import { queryKeys } from '@/lib/queryKeys'
import type { QueryClient } from '@tanstack/react-query'

interface RunOrTaskStateChangeKeys {
	issueId?: string
	taskId?: string
	runId?: string
}

export function invalidateAfterRunOrTaskStateChange(
	queryClient: QueryClient,
	{ issueId, taskId, runId }: RunOrTaskStateChangeKeys
): void {
	if (issueId) {
		queryClient.invalidateQueries({ queryKey: queryKeys.launchTasks.forIssue(issueId) })
	}
	if (taskId) {
		queryClient.invalidateQueries({ queryKey: queryKeys.launchTasks.detail(taskId) })
		queryClient.invalidateQueries({ queryKey: queryKeys.launchTasks.steps(taskId) })
	}
	if (runId) {
		queryClient.invalidateQueries({ queryKey: queryKeys.runs.detail(runId) })
	}
	queryClient.invalidateQueries({ queryKey: queryKeys.runs.all })
	queryClient.invalidateQueries({ queryKey: queryKeys.issues.all })
	queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.queue })
}
