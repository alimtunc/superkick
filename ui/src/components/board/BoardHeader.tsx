import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { useLastRefreshed } from '@/hooks/useLastRefreshed'
import { RefreshCw } from 'lucide-react'

interface BoardHeaderProps {
	openCount: number
	needsHumanCount: number
	loading: boolean
	lastRefresh: number | null
	onRefresh: () => void
}

export function BoardHeader({
	openCount,
	needsHumanCount,
	loading,
	lastRefresh,
	onRefresh
}: BoardHeaderProps) {
	const refreshLabel = useLastRefreshed(lastRefresh, loading)

	return (
		<header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur-md">
			<div className="mx-auto flex h-12 max-w-360 items-center justify-between px-5">
				<div className="flex items-center gap-3">
					<span className="font-data text-[11px] font-medium tracking-wider text-fg uppercase">
						BOARD
					</span>
					<span className="font-data text-[10px] text-fg-dim">{openCount} in flight</span>
					{needsHumanCount > 0 ? (
						<span className="font-data text-[10px] text-danger">{needsHumanCount} need you</span>
					) : null}
				</div>
				<Tooltip label={refreshLabel}>
					<Button
						variant="ghost"
						size="icon-xs"
						onClick={onRefresh}
						disabled={loading}
						aria-label={refreshLabel ?? 'Refresh'}
					>
						<RefreshCw
							size={13}
							strokeWidth={1.75}
							aria-hidden="true"
							className={loading ? 'animate-spin' : ''}
						/>
					</Button>
				</Tooltip>
			</div>
		</header>
	)
}
