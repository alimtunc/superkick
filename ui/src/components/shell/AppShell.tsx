import { CommandBar } from '@/components/command/CommandBar'
import { SessionWatchRail } from '@/components/dashboard/SessionWatchRail'
import { useDashboardRuns } from '@/hooks/useDashboardRuns'
import { pathnameToTitle } from '@/shell/pathnameToTitle'
import { Sidebar } from '@/shell/Sidebar'
import { Topbar } from '@/shell/Topbar'
import { TopbarStatus } from '@/shell/TopbarStatus'
import { usePageActionsStore } from '@/shell/usePageActions'
import { Outlet, useMatches } from '@tanstack/react-router'
import { Toaster } from 'sonner'

import { RunDock } from './RunDock'

export function AppShell() {
	const dashboard = useDashboardRuns()
	const matches = useMatches()
	const pathname = matches.at(-1)?.pathname ?? '/'
	const { active, title, crumbs } = pathnameToTitle(pathname)
	const pageTitle = usePageActionsStore((s) => s.title)
	const pageSub = usePageActionsStore((s) => s.sub)
	const pageRight = usePageActionsStore((s) => s.right)
	const pageBack = usePageActionsStore((s) => s.back)

	return (
		<div className="flex h-screen bg-canvas">
			<Sidebar active={active} />
			<div className="flex min-w-0 flex-1 flex-col">
				<Topbar
					title={pageTitle ?? title}
					crumbs={crumbs}
					sub={pageSub ?? undefined}
					right={pageRight ?? <TopbarStatus />}
					back={pageBack ?? undefined}
				/>
				<SessionWatchRail refTime={dashboard.refTime} mode="overview" />
				<main className="min-h-0 flex-1 overflow-y-auto">
					<Outlet />
				</main>
				<RunDock />
			</div>
			<CommandBar />
			<Toaster
				position="top-right"
				duration={1500}
				toastOptions={{
					style: {
						background: 'var(--color-surface)',
						border: '1px solid var(--color-border)',
						color: 'var(--color-fg)',
						fontSize: '12px'
					}
				}}
			/>
		</div>
	)
}
