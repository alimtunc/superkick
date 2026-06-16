import { Button, Tooltip } from '@/components/primitives'
import { lastRefreshedLabel } from '@/lib/domain'
import { RefreshCw } from 'lucide-react'

interface RefreshHeaderProps {
	title: string
	countText: string
	needsText: string | null
	loading: boolean
	lastRefresh: number | null
	onRefresh: () => void
	maxWidthClass?: string
}

export function RefreshHeader({
	title,
	countText,
	needsText,
	loading,
	lastRefresh,
	onRefresh,
	maxWidthClass = 'max-w-5xl'
}: RefreshHeaderProps) {
	const refreshLabel = lastRefreshedLabel(lastRefresh, loading)

	return (
		<header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur-md">
			<div className={`mx-auto flex h-12 ${maxWidthClass} items-center justify-between px-5`}>
				<div className="flex items-center gap-3">
					<span className="font-data text-[11px] font-medium tracking-wider text-fg uppercase">
						{title}
					</span>
					<span className="font-data text-[10px] text-fg-dim">{countText}</span>
					{needsText ? (
						<span className="font-data text-[10px] text-danger">{needsText}</span>
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
