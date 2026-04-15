import { SessionWatchRail } from '@/components/dashboard/SessionWatchRail'
import { useDashboardRuns } from '@/hooks/useDashboardRuns'
import { Outlet } from '@tanstack/react-router'
import { Toaster } from 'sonner'

import { CommandBar } from './CommandBar'
import { RunDock } from './RunDock'
import { ShellHeader } from './ShellHeader'
import { Sidebar } from './Sidebar'

export function AppShell() {
	const dashboard = useDashboardRuns()

	return (
		<div className="flex h-screen bg-void">
			<Sidebar />
			<div className="flex min-w-0 flex-1 flex-col">
				<ShellHeader />
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
						background: '#2a2a2e',
						border: '1px solid #3a3a3e',
						color: '#c8c8cc',
						fontSize: '12px'
					}
				}}
			/>
		</div>
	)
}
