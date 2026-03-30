import { Outlet } from '@tanstack/react-router'
import { Toaster } from 'sonner'

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
