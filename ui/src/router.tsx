import { ControlCenter } from '@/pages/ControlCenter'
import { RunDetailPage } from '@/pages/RunDetail'
import { createRouter, createRootRoute, createRoute, Outlet } from '@tanstack/react-router'

// ── Root layout ────────────────────────────────────────────────────────

const rootRoute = createRootRoute({
	component: Outlet
})

// ── Routes ─────────────────────────────────────────────────────────────

const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/',
	component: ControlCenter
})

const runDetailRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/runs/$runId',
	component: RunDetailPage
})

// ── Router ─────────────────────────────────────────────────────────────

const routeTree = rootRoute.addChildren([indexRoute, runDetailRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router
	}
}
