import type { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'

import { Route as rootRoute } from './__root'
import { Route as attentionRoute } from './_shell/attention'
import { Route as indexRoute } from './_shell/index'
import { Route as issuesRoute } from './_shell/issues'
import { Route as issueDetailRoute } from './_shell/issues.$issueId'
import { Route as queueRoute } from './_shell/queue'
import { Route as shellRoute } from './_shell/route'
import { Route as runsRoute } from './_shell/runs'
import { Route as runDetailRoute } from './_shell/runs.$runId'
import { Route as sessionsRoute } from './_shell/sessions'
import { Route as settingsRoute } from './_shell/settings'

const routeTree = rootRoute.addChildren([
	shellRoute.addChildren([
		indexRoute,
		issuesRoute,
		issueDetailRoute,
		queueRoute,
		runsRoute,
		runDetailRoute,
		sessionsRoute,
		attentionRoute,
		settingsRoute
	])
])

export function createAppRouter(queryClient: QueryClient) {
	return createRouter({
		routeTree,
		context: { queryClient },
		defaultPreload: 'intent',
		defaultPreloadStaleTime: 0
	})
}

export type AppRouter = ReturnType<typeof createAppRouter>

declare module '@tanstack/react-router' {
	interface Register {
		router: AppRouter
	}
}
