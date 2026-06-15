import type { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'

import { Route as rootRoute } from './__root'
import { Route as agentsRoute } from './_shell/agents'
import { Route as agentDetailRoute } from './_shell/agents.$agentId'
import { Route as boardRoute } from './_shell/board'
import { Route as indexRoute } from './_shell/index'
import { Route as issuesRoute } from './_shell/issues'
import { Route as issueDetailRoute } from './_shell/issues.$issueId'
import { Route as queueRoute } from './_shell/queue'
import { Route as reviewsRoute } from './_shell/reviews'
import { Route as reviewDetailRoute } from './_shell/reviews.$number'
import { Route as shellRoute } from './_shell/route'
import { Route as runsRoute } from './_shell/runs'
import { Route as runDetailRoute } from './_shell/runs.$runId'
import { Route as skillsRoute } from './_shell/skills'
import { Route as tasksDetailRoute } from './_shell/tasks.$taskId'
import { Route as tasksNewRoute } from './_shell/tasks.new'
import { Route as settingsRoute } from './settings'

const routeTree = rootRoute.addChildren([
	shellRoute.addChildren([
		indexRoute,
		boardRoute,
		reviewsRoute,
		reviewDetailRoute,
		issuesRoute,
		issueDetailRoute,
		queueRoute,
		runsRoute,
		runDetailRoute,
		agentsRoute,
		agentDetailRoute,
		skillsRoute,
		tasksNewRoute,
		tasksDetailRoute
	]),
	settingsRoute
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
