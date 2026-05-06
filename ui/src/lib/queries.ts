import {
	fetchConversation,
	fetchDashboardQueue,
	fetchIssueDetail,
	fetchIssues,
	fetchLaunchQueue,
	fetchRun,
	fetchRuns,
	fetchRuntimes
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

export const runDetailQuery = (id: string) =>
	queryOptions({
		queryKey: queryKeys.runs.detail(id),
		queryFn: () => fetchRun(id)
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
