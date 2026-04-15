import { Button } from '@/components/ui/button'
import { useDashboardRuns } from '@/hooks/useDashboardRuns'
import { useCommandBarStore } from '@/stores/commandBar'
import { Command } from 'lucide-react'

import { AttentionBell } from './AttentionBell'

export function ShellHeader() {
	const dashboard = useDashboardRuns()
	const openBar = useCommandBarStore((s) => s.openBar)

	return (
		<header className="sticky top-0 z-40 flex h-12 shrink-0 items-center justify-between border-b border-edge bg-carbon/90 px-5 backdrop-blur-md">
			<div className="flex items-center gap-3">
				<span className="font-data text-[11px] text-dim">
					{dashboard.lastRefresh.toLocaleTimeString([], {
						hour: '2-digit',
						minute: '2-digit',
						second: '2-digit'
					})}
				</span>
				{dashboard.active.length > 0 ? (
					<span className="font-data text-[11px] text-cyan">
						<span className="live-pulse mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-cyan align-middle" />
						{dashboard.active.length} active
					</span>
				) : (
					<span className="font-data text-[11px] text-dim">idle</span>
				)}
			</div>
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={openBar}
					className="group flex h-7 items-center gap-2 rounded border border-edge bg-graphite/60 px-2 text-dim transition-colors hover:border-edge-bright hover:text-silver"
					title="Command bar (⌘K)"
				>
					<Command size={12} />
					<span className="font-data text-[11px]">Command</span>
					<kbd className="font-data rounded border border-edge px-1 py-px text-[9px] tracking-wider text-dim uppercase group-hover:text-silver">
						⌘K
					</kbd>
				</button>
				<AttentionBell />
				<Button
					variant="outline"
					size="xs"
					onClick={() => dashboard.refresh()}
					disabled={dashboard.loading}
					className="font-data text-[11px] text-silver hover:text-fog"
				>
					{dashboard.loading ? '...' : 'REFRESH'}
				</Button>
			</div>
		</header>
	)
}
