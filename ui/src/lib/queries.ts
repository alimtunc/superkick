import {
	fetchConversation,
	fetchDashboardQueue,
	fetchIssueDetail,
	fetchIssues,
	fetchLaunchQueue,
	fetchLaunchTaskSteps,
	fetchRun,
	fetchRuns,
	fetchRuntimes,
	listAgents
} from '@/api'
import { queryOptions, skipToken } from '@tanstack/react-query'

import { queryKeys } from './queryKeys'

export const issuesQuery = (limit = 200) =>
	queryOptions({
		queryKey: queryKeys.issues.list(limit),
		queryFn: () => fetchIssues(limit),
		staleTime: 15_000
	})

export const issueDetailQuery = (id: string) =>
	queryOptions({
		queryKey: queryKeys.issues.detail(id),
		queryFn: () => fetchIssueDetail(id),
		staleTime: 15_000
	})

export const runsQuery = () =>
	queryOptions({
		queryKey: queryKeys.runs.all,
		queryFn: fetchRuns,
		staleTime: 10_000
	})

export const runDetailQuery = (id: string | null) =>
	queryOptions({
		queryKey: id ? queryKeys.runs.detail(id) : ['runs', 'detail', 'pending'],
		queryFn: id ? () => fetchRun(id) : skipToken
	})

export const conversationDetailQuery = (id: string | null) =>
	queryOptions({
		queryKey: id ? queryKeys.conversations.detail(id) : ['conversations', 'detail', 'pending'],
		queryFn: id ? () => fetchConversation(id) : skipToken,
		staleTime: 5_000
	})

export const dashboardQueueQuery = () =>
	queryOptions({
		queryKey: queryKeys.dashboard.queue,
		queryFn: fetchDashboardQueue,
		staleTime: 5_000
	})

export const launchQueueQuery = () =>
	queryOptions({
		queryKey: queryKeys.launchQueue.all,
		queryFn: fetchLaunchQueue,
		staleTime: 5_000
	})

export const runtimesQuery = () =>
	queryOptions({
		queryKey: queryKeys.runtimes.list,
		queryFn: fetchRuntimes,
		staleTime: 10_000
	})

export const agentsQuery = () =>
	queryOptions({
		queryKey: queryKeys.agents.all,
		queryFn: listAgents,
		// Catalog rarely changes mid-session — refetch on focus/mount only.
		staleTime: 5 * 60_000
	})

export const launchTaskStepsQuery = (taskId: string | null) =>
	queryOptions({
		queryKey: taskId ? queryKeys.launchTasks.steps(taskId) : ['launch-tasks', 'pending', 'steps'],
		queryFn: taskId ? () => fetchLaunchTaskSteps(taskId) : skipToken,
		staleTime: 3_000
	})
