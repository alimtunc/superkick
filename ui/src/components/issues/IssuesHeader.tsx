import { Button } from '@/components/ui/button'
import { useLastRefreshed } from '@/components/ui/last-refreshed'
import { Tooltip } from '@/components/ui/tooltip'
import { RefreshCw } from 'lucide-react'

export function IssuesHeader({
	totalCount,
	loading,
	lastRefresh,
	onRefresh
}: {
	totalCount: number
	loading: boolean
	lastRefresh: Date | null
	onRefresh: () => void
}) {
	const refreshLabel = useLastRefreshed(lastRefresh, loading)

	return (
		<header className="sticky top-0 z-30 border-b border-edge bg-carbon/90 backdrop-blur-md">
			<div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-5">
				<div className="flex items-center gap-3">
					<span className="font-data text-[11px] font-medium tracking-wider text-fog uppercase">
						ISSUES
					</span>
					<span className="font-data text-[10px] text-dim">{totalCount}</span>
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
