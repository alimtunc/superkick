import { RUN_SESSION_TAB_ITEMS } from '@/domains/runs/components/run-tabs/runSessionTabItems'
import { useRunDrawerStore } from '@/stores/runDrawer'

export function RunDrawerTabs() {
	const tab = useRunDrawerStore((s) => s.tab)
	const setTab = useRunDrawerStore((s) => s.setTab)

	return (
		<div className="drawer__tabs" role="tablist" aria-label="Run drawer">
			{RUN_SESSION_TAB_ITEMS.map((item) => {
				const active = item.id === tab
				return (
					<button
						key={item.id}
						type="button"
						role="tab"
						aria-selected={active}
						onClick={() => setTab(item.id)}
						className={`dtab${active ? ' dtab--active' : ''}`}
					>
						{item.label}
					</button>
				)
			})}
		</div>
	)
}
