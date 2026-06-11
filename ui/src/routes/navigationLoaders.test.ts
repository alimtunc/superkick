import { describe, expect, it, vi } from 'vitest'

import { Route as boardRoute } from './_shell/board'
import { Route as inboxRoute } from './_shell/index'
import { Route as issuesRoute } from './_shell/issues'
import { Route as issueDetailRoute } from './_shell/issues.$issueId'
import { Route as queueRoute } from './_shell/queue'
import { Route as runsRoute } from './_shell/runs'
import { Route as runDetailRoute } from './_shell/runs.$runId'
import { Route as taskDetailRoute } from './_shell/tasks.$taskId'

interface LoaderQueryClient {
	ensureQueryData: ReturnType<typeof vi.fn>
	prefetchQuery: ReturnType<typeof vi.fn>
}

function makeQueryClient(): LoaderQueryClient {
	return {
		ensureQueryData: vi.fn(() => new Promise(() => {})),
		prefetchQuery: vi.fn(() => new Promise(() => {}))
	}
}

function callLoader(route: { options: { loader?: unknown } }, ctx: unknown): unknown {
	const loader = route.options.loader
	expect(loader).toBeTypeOf('function')
	return (loader as (ctx: unknown) => unknown)(ctx)
}

describe('route loaders', () => {
	it.each([
		{ label: 'inbox', route: inboxRoute, ctx: {}, prefetches: 3 },
		{ label: 'board', route: boardRoute, ctx: {}, prefetches: 1 },
		{ label: 'issues', route: issuesRoute, ctx: {}, prefetches: 2 },
		{ label: 'runs', route: runsRoute, ctx: {}, prefetches: 1 },
		{ label: 'queue', route: queueRoute, ctx: {}, prefetches: 1 },
		{
			label: 'issue detail',
			route: issueDetailRoute,
			ctx: { params: { issueId: 'SUP-123' } },
			prefetches: 1
		},
		{
			label: 'run detail',
			route: runDetailRoute,
			ctx: { params: { runId: 'run-123' } },
			prefetches: 1
		},
		{
			label: 'task detail',
			route: taskDetailRoute,
			ctx: { params: { taskId: 'task-123' } },
			prefetches: 2
		}
	])('$label loader prefetches without blocking navigation', ({ route, ctx, prefetches }) => {
		const queryClient = makeQueryClient()

		const result = callLoader(route, { context: { queryClient }, ...ctx })

		expect(result).toBeUndefined()
		expect(queryClient.prefetchQuery).toHaveBeenCalledTimes(prefetches)
		expect(queryClient.ensureQueryData).not.toHaveBeenCalled()
	})
})
