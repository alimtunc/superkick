import { AppShell } from '@/components/shell/AppShell'
import { ControlCenter } from '@/pages/ControlCenter'
import { PlaceholderPage } from '@/pages/Placeholder'
import { RunDetailPage } from '@/pages/RunDetail'
import { createRouter, createRootRoute, createRoute } from '@tanstack/react-router'

// ── Root layout — AppShell provides sidebar + header + scrollable main ─

const rootRoute = createRootRoute({
	component: AppShell,
})

// ── Routes ─────────────────────────────────────────────────────────────

const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/',
	component: ControlCenter,
})

const issuesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/issues',
	component: () => (
		<PlaceholderPage title="Issues" description="Linear issue sync and triage — coming with SUP-24." />
	),
})

const runsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/runs',
	component: () => (
		<PlaceholderPage title="Runs" description="Dedicated runs list — coming in a future iteration." />
	),
})

const runDetailRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/runs/$runId',
	component: RunDetailPage,
})

const sessionsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/sessions',
	component: () => (
		<PlaceholderPage title="Sessions" description="Session monitoring and history — coming soon." />
	),
})

const attentionRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/attention',
	component: () => (
		<PlaceholderPage title="Attention" description="Items requiring human attention — coming soon." />
	),
})

const settingsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/settings',
	component: () => (
		<PlaceholderPage title="Settings" description="Superkick configuration — coming soon." />
	),
})

// ── Router ─────────────────────────────────────────────────────────────

const routeTree = rootRoute.addChildren([
	indexRoute,
	issuesRoute,
	runsRoute,
	runDetailRoute,
	sessionsRoute,
	attentionRoute,
	settingsRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router
	}
}
