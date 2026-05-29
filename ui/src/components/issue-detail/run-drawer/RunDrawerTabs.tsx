import { useRunDrawerStore, type RunDrawerTab } from '@/stores/runDrawer'

interface DrawerTabDescriptor {
	id: RunDrawerTab
	label: string
}

const TABS: readonly DrawerTabDescriptor[] = [
	{ id: 'activity', label: 'Activity' },
	{ id: 'tools', label: 'Tool calls' },
	{ id: 'files', label: 'Files' },
	{ id: 'logs', label: 'Logs' },
	{ id: 'terminal', label: 'Terminal' }
]

export function RunDrawerTabs() {
	const tab = useRunDrawerStore((s) => s.tab)
	const setTab = useRunDrawerStore((s) => s.setTab)

	return (
		<div className="drawer__tabs" role="tablist" aria-label="Run drawer">
			{TABS.map((descriptor) => {
				const active = descriptor.id === tab
				return (
					<button
						key={descriptor.id}
						type="button"
						role="tab"
						aria-selected={active}
						onClick={() => setTab(descriptor.id)}
						className={`dtab${active ? ' dtab--active' : ''}`}
					>
						{descriptor.label}
					</button>
				)
			})}
		</div>
	)
}
