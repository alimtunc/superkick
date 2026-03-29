import { Outlet } from '@tanstack/react-router'

import { ShellHeader } from './ShellHeader'
import { Sidebar } from './Sidebar'

export function AppShell() {
	return (
		<div className="flex h-screen bg-void">
			<Sidebar />
			<div className="flex min-w-0 flex-1 flex-col">
				<ShellHeader />
				<main className="flex-1 overflow-y-auto">
					<Outlet />
				</main>
			</div>
		</div>
	)
}
