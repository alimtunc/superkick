import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { useLastRefreshed } from '@/hooks/useLastRefreshed'
import { RefreshCw } from 'lucide-react'

interface RunsHeaderProps {
	/** Open work — active + needs-human + in-review. Excludes the 20-cap "recent". */
	openCount: number
	needsHumanCount: number
	loading: boolean
	lastRefresh: number | null
	onRefresh: () => void
}

export function RunsHeader({ openCount, needsHumanCount, loading, lastRefresh, onRefresh }: RunsHeaderProps) {
	const refreshLabel = useLastRefreshed(lastRefresh, loading)

	return (
		<header className="sticky top-0 z-30 border-b border-edge bg-carbon/90 backdrop-blur-md">
			<div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-5">
				<div className="flex items-center gap-3">
					<span className="font-data text-[11px] font-medium tracking-wider text-fog uppercase">
						RUNS
					</span>
					<span className="font-data text-[10px] text-ash">{openCount} open</span>
					{needsHumanCount > 0 ? (
						<span className="font-data text-[10px] text-oxide">{needsHumanCount} need human</span>
					) : null}
				</div>
				<Tooltip label={refreshLabel}>
					<Button
						variant="ghost"
						size="icon-xs"
						onClick={onRefresh}
						disabled={loading}
						aria-label={refreshLabel ?? undefined}
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
