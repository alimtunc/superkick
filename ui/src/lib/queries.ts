import {
	fetchConversation,
	fetchDashboardQueue,
	fetchIssueDetail,
	fetchIssueMemoryEntries,
	fetchIssuePullRequestDiff,
	fetchIssues,
	fetchIssueWorkspaceContext,
	fetchLaunchProfiles,
	fetchLaunchQueue,
	fetchLaunchTask,
	fetchLaunchTaskSteps,
	fetchProviderSettings,
	fetchRun,
	fetchRunDiff,
	fetchRunEvents,
	fetchRuns,
	fetchRunToolCalls,
	fetchRuntimes,
	fetchSearch,
	fetchSkills,
	listAgents,
	listLaunchTaskInterventions
} from '@/api'
import type { IssuePullRequest, SearchParams } from '@/types'
import { infiniteQueryOptions, queryOptions, skipToken } from '@tanstack/react-query'

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
		staleTime: 15_000,
		refetchInterval: 30_000,
		refetchIntervalInBackground: false
	})

export const issuePullRequestDiffQuery = (issueId: string, pr: IssuePullRequest | null, enabled: boolean) =>
	queryOptions({
		queryKey: pr
			? queryKeys.issues.prDiff(issueId, pr.repo_slug, pr.number, pr.head_sha || 'pending')
			: ['issues', issueId, 'pull-request-diff', 'pending'],
		queryFn:
			pr && enabled ? () => fetchIssuePullRequestDiff(issueId, pr.repo_slug, pr.number) : skipToken,
		staleTime: 30_000
	})

export const issueWorkspaceContextQuery = (id: string | null) =>
	queryOptions({
		queryKey: id ? queryKeys.issues.workspaceContext(id) : ['issues', 'pending', 'workspace-context'],
		queryFn: id ? () => fetchIssueWorkspaceContext(id) : skipToken,
		staleTime: 15_000
	})

export const issueMemoryEntriesQuery = (id: string | null) =>
	infiniteQueryOptions({
		queryKey: id ? queryKeys.issues.memory(id) : ['issues', 'pending', 'memory'],
		queryFn: id
			? ({ pageParam }: { pageParam: string | null }) => fetchIssueMemoryEntries(id, pageParam)
			: skipToken,
		initialPageParam: null as string | null,
		getNextPageParam: (lastPage) => lastPage.next_cursor,
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

export const runEventsQuery = (id: string | null) =>
	queryOptions({
		queryKey: id ? queryKeys.runs.events(id) : ['runs', 'pending', 'events'],
		queryFn: id ? () => fetchRunEvents(id) : skipToken,
		staleTime: 10_000
	})

export const runToolCallsQuery = (id: string | null) =>
	queryOptions({
		queryKey: id ? queryKeys.runs.toolCalls(id) : ['runs', 'pending', 'tool-calls'],
		queryFn: id ? () => fetchRunToolCalls(id) : skipToken,
		staleTime: 10_000
	})

export const runDiffQuery = (id: string | null, enabled: boolean) =>
	queryOptions({
		queryKey: id ? queryKeys.runs.diff(id) : ['runs', 'pending', 'diff'],
		queryFn: id && enabled ? () => fetchRunDiff(id) : skipToken,
		staleTime: 10_000
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

export const launchTaskDetailQuery = (taskId: string | null) =>
	queryOptions({
		queryKey: taskId ? queryKeys.launchTasks.detail(taskId) : ['launch-tasks', 'pending', 'detail'],
		queryFn: taskId ? () => fetchLaunchTask(taskId) : skipToken,
		staleTime: 3_000
	})

export const searchQuery = (params: SearchParams) =>
	queryOptions({
		queryKey: queryKeys.search.query(params.q, params.scope, params.includeDone),
		queryFn: () => fetchSearch(params),
		staleTime: 30_000
	})

export const launchTaskInterventionsQuery = (taskId: string | null) =>
	queryOptions({
		queryKey: taskId
			? queryKeys.launchTasks.interventions(taskId)
			: ['launch-tasks', 'pending', 'interventions'],
		queryFn: taskId ? () => listLaunchTaskInterventions(taskId) : skipToken,
		staleTime: 3_000
	})

export const providerSettingsQuery = () =>
	queryOptions({
		queryKey: queryKeys.providerSettings.all,
		queryFn: fetchProviderSettings,
		staleTime: 30_000
	})

export const skillsQuery = () =>
	queryOptions({
		queryKey: queryKeys.skills.all,
		queryFn: fetchSkills,
		staleTime: 30_000
	})

export const launchProfilesQuery = () =>
	queryOptions({
		queryKey: queryKeys.launchProfiles.all,
		queryFn: fetchLaunchProfiles,
		staleTime: 30_000
	})
