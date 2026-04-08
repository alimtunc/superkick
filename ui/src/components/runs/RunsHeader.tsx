import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { useLastRefreshed } from '@/hooks/useLastRefreshed'
import { RefreshCw } from 'lucide-react'

export function RunsHeader({
	total,
	activeCount,
	loading,
	lastRefresh,
	onRefresh
}: {
	total: number
	activeCount: number
	loading: boolean
	lastRefresh: number | null
	onRefresh: () => void
}) {
	const refreshLabel = useLastRefreshed(lastRefresh, loading)

	return (
		<header className="sticky top-0 z-30 border-b border-edge bg-carbon/90 backdrop-blur-md">
			<div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-5">
				<div className="flex items-center gap-3">
					<span className="font-data text-[11px] font-medium tracking-wider text-fog uppercase">
						RUNS
					</span>
					<span className="font-data text-[10px] text-dim">{total}</span>
					{activeCount > 0 ? (
						<span className="font-data text-[10px] text-cyan">{activeCount} active</span>
					) : null}
				</div>
				<Tooltip label={refreshLabel}>
					<Button
						variant="ghost"
						size="icon-xs"
						onClick={onRefresh}
						disabled={loading}
						className="text-dim hover:text-silver"
					>
						<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
					</Button>
				</Tooltip>
			</div>
		</header>
	)
}
