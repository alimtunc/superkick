export const queryKeys = {
	issues: {
		all: ['issues'] as const,
		list: (limit: number) => ['issues', limit] as const,
		detail: (id: string) => ['issues', 'detail', id] as const,
		workspaceContext: (id: string) => ['issues', id, 'workspace-context'] as const,
		memory: (id: string) => ['issues', id, 'memory'] as const
	},
	runs: {
		all: ['runs'] as const,
		detail: (id: string) => ['runs', id] as const,
		toolCalls: (id: string) => ['runs', id, 'tool-calls'] as const,
		diff: (id: string) => ['runs', id, 'diff'] as const
	},
	dashboard: {
		all: ['dashboard'] as const,
		queue: ['dashboard', 'queue'] as const
	},
	launchQueue: {
		all: ['launch-queue'] as const
	},
	runtimes: {
		all: ['runtimes'] as const,
		list: ['runtimes', 'list'] as const
	},
	conversations: {
		all: ['conversations'] as const,
		detail: (id: string) => ['conversations', 'detail', id] as const,
		list: (subjectKey: string) => ['conversations', 'list', subjectKey] as const
	},
	terminalTakeover: {
		modes: (runId: string) => ['terminal-takeover', 'modes', runId] as const,
		active: (runId: string) => ['terminal-takeover', 'active', runId] as const
	},
	agents: {
		all: ['agents'] as const
	},
	launchTasks: {
		all: ['launch-tasks'] as const,
		forIssue: (issueId: string) => ['issues', issueId, 'launch-tasks'] as const,
		detail: (taskId: string) => ['launch-tasks', taskId, 'detail'] as const,
		steps: (taskId: string) => ['launch-tasks', taskId, 'steps'] as const,
		interventions: (taskId: string) => ['launch-tasks', taskId, 'interventions'] as const
	},
	search: {
		query: (q: string, scope: string, includeDone: boolean) => ['search', q, scope, includeDone] as const
	}
}

/**
 * Recognise a query key produced by `queryKeys.launchTasks.forIssue`. Kept next
 * to the key factory so the tuple shape lives in exactly one place — predicates
 * (e.g. cache invalidation on broker `lagged`) call this instead of indexing
 * `queryKey` positionally and silently breaking on a shape change.
 */
export function isLaunchTaskForIssueKey(key: unknown): boolean {
	return (
		Array.isArray(key) &&
		key.length === 3 &&
		key[0] === 'issues' &&
		typeof key[1] === 'string' &&
		key[2] === 'launch-tasks'
	)
}
