import {
	fetchDashboardQueue,
	fetchIssueDetail,
	fetchIssues,
	fetchLaunchQueue,
	fetchRun,
	fetchRuns
} from '@/api'
import { queryOptions } from '@tanstack/react-query'

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
