import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { useDashboardRuns } from '@/hooks/useDashboardRuns'
import { useCommandBarStore } from '@/stores/commandBar'
import { Command, RefreshCw } from 'lucide-react'

import { AttentionBell } from './AttentionBell'

export function ShellHeader() {
	const dashboard = useDashboardRuns()
	const openBar = useCommandBarStore((s) => s.openBar)

	return (
		<header className="sticky top-0 z-40 flex h-12 shrink-0 items-center justify-between border-b border-edge bg-carbon/90 px-5 backdrop-blur-md">
			<div className="flex items-center gap-3">
				<span className="font-data text-[11px] text-ash">
					{dashboard.lastRefresh.toLocaleTimeString([], {
						hour: '2-digit',
						minute: '2-digit',
						second: '2-digit'
					})}
				</span>
				{dashboard.active.length > 0 ? (
					<span className="font-data text-[11px] text-cyan">
						<span
							className="live-pulse mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-cyan align-middle"
							aria-hidden="true"
						/>
						{dashboard.active.length} active
					</span>
				) : (
					<span className="font-data text-[11px] text-ash">idle</span>
				)}
			</div>
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={openBar}
					className="group flex h-7 items-center gap-2 rounded-md border border-edge bg-graphite/60 px-2 text-silver transition-colors hover:border-edge-bright hover:bg-slate-deep/60 hover:text-fog focus-visible:ring-2 focus-visible:ring-mineral/40 focus-visible:outline-none"
					title="Command bar (⌘K)"
				>
					<Command size={12} strokeWidth={1.75} aria-hidden="true" />
					<span className="font-data text-[11px]">Command</span>
					<kbd className="font-data rounded border border-edge px-1 py-px text-[9px] tracking-wider text-ash uppercase group-hover:text-silver">
						⌘K
					</kbd>
				</button>
				<AttentionBell />
				<Tooltip label="Refresh dashboard">
					<Button
						variant="outline"
						size="icon-xs"
						onClick={() => dashboard.refresh()}
						disabled={dashboard.loading}
						aria-label="Refresh dashboard"
					>
						<RefreshCw
							size={13}
							strokeWidth={1.75}
							className={dashboard.loading ? 'animate-spin' : undefined}
						/>
					</Button>
				</Tooltip>
			</div>
		</header>
	)
}
