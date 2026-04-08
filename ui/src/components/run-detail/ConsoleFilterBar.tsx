import type { EventKind } from '@/types'

export type FilterTab = 'all' | 'output' | 'steps' | 'errors'

export const TAB_FILTERS: Record<FilterTab, Set<EventKind> | null> = {
	all: null,
	output: new Set(['agent_output', 'command_output', 'operator_input']),
	steps: new Set(['step_started', 'step_completed', 'step_failed', 'state_change']),
	errors: new Set(['error'])
}

const TAB_LABELS: Record<FilterTab, string> = {
	all: 'ALL',
	output: 'OUTPUT',
	steps: 'STEPS',
	errors: 'ERRORS'
}

const TABS: FilterTab[] = ['all', 'output', 'steps', 'errors']

export function ConsoleFilterBar({
	activeTab,
	onTabChange,
	errorCount
}: {
	activeTab: FilterTab
	onTabChange: (tab: FilterTab) => void
	errorCount: number
}) {
	return (
		<div className="flex gap-1 border-b border-edge/50 px-3 py-1.5">
			{TABS.map((tab) => {
				const isActive = tab === activeTab
				const showBadge = tab === 'errors' && errorCount > 0

				return (
					<button
						key={tab}
						type="button"
						onClick={() => onTabChange(tab)}
						className={`font-data rounded px-2 py-0.5 text-[10px] tracking-wider transition-colors ${
							isActive ? 'bg-edge text-fog' : 'text-dim hover:text-ash'
						}`}
					>
						{TAB_LABELS[tab]}
						{showBadge ? <span className="ml-1 text-oxide">{errorCount}</span> : null}
					</button>
				)
			})}
		</div>
	)
}
