import { SidebarInset, SidebarProvider } from '@/components/composites/sidebar'
import { CommandBar } from '@/domains/command/components/CommandBar'
import { SessionWatchRail } from '@/domains/dashboard/components/SessionWatchRail'
import { useDashboardRuns } from '@/hooks/useDashboardRuns'
import { FEATURES } from '@/lib/features'
import { ConnectionBanner } from '@/shell/ConnectionBanner'
import { pathnameToTitle } from '@/shell/pathnameToTitle'
import { Sidebar } from '@/shell/Sidebar'
import { Topbar } from '@/shell/Topbar'
import { TopbarStatus } from '@/shell/TopbarStatus'
import { usePageActionsStore } from '@/shell/usePageActions'
import type { ShellNavId } from '@/types'
import type { SKIconName } from '@/types/icons'
import { Outlet, useMatches } from '@tanstack/react-router'

import { AppFrame } from './AppFrame'
import { RunDock } from './RunDock'

const SECTION_ICON: Record<Exclude<ShellNavId, null>, SKIconName> = {
	inbox: 'inbox',
	board: 'layers',
	reviews: 'pr',
	issues: 'issue',
	agents: 'agent',
	skills: 'spark'
}

export function AppShell() {
	const dashboard = useDashboardRuns()
	const matches = useMatches()
	const pathname = matches.at(-1)?.pathname ?? '/'
	const { active, title, crumbs } = pathnameToTitle(pathname)
	const pageTitle = usePageActionsStore((s) => s.title)
	const pageCrumbs = usePageActionsStore((s) => s.crumbs)
	const pageSub = usePageActionsStore((s) => s.sub)
	const pageRight = usePageActionsStore((s) => s.right)
	const pageBack = usePageActionsStore((s) => s.back)

	return (
		<AppFrame>
			<SidebarProvider className="w-auto min-w-0 flex-1">
				<Sidebar active={active} />
				<SidebarInset>
					<Topbar
						title={pageTitle ?? title}
						icon={active ? SECTION_ICON[active] : undefined}
						crumbs={pageCrumbs ?? crumbs}
						sub={pageSub ?? undefined}
						right={pageRight ?? <TopbarStatus />}
						back={pageBack ?? undefined}
					/>
					<ConnectionBanner />
					{FEATURES.sessionWatchRail ? (
						<SessionWatchRail refTime={dashboard.refTime} mode="overview" />
					) : null}
					<div className="min-h-0 flex-1 overflow-y-auto">
						<Outlet />
					</div>
					{FEATURES.globalRunDock ? <RunDock /> : null}
				</SidebarInset>
			</SidebarProvider>
			<CommandBar />
		</AppFrame>
	)
}
