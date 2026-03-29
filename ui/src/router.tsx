import { AppShell } from '@/components/shell/AppShell'
import { AttentionPage } from '@/pages/AttentionPage'
import { IssueDetailPage } from '@/pages/IssueDetailPage'
import { IssuesPage } from '@/pages/IssuesPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { RunDetailPage } from '@/pages/RunDetail'
import { RunsPage } from '@/pages/RunsPage'
import { SessionsPage } from '@/pages/SessionsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { createRouter, createRootRoute, createRoute } from '@tanstack/react-router'

// ── Root layout — AppShell provides sidebar + header + scrollable main ─

const rootRoute = createRootRoute({
	component: AppShell
})

// ── Routes ─────────────────────────────────────────────────────────────

const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/',
	component: OverviewPage
})

const issuesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/issues',
	component: IssuesPage
})

const issueDetailRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/issues/$issueId',
	component: IssueDetailPage
})

const runsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/runs',
	component: RunsPage
})

const runDetailRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/runs/$runId',
	component: RunDetailPage
})

const sessionsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/sessions',
	component: SessionsPage
})

const attentionRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/attention',
	component: AttentionPage
})

const settingsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/settings',
	component: SettingsPage
})

// ── Router ─────────────────────────────────────────────────────────────

const routeTree = rootRoute.addChildren([
	indexRoute,
	issuesRoute,
	issueDetailRoute,
	runsRoute,
	runDetailRoute,
	sessionsRoute,
	attentionRoute,
	settingsRoute
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router
	}
}
