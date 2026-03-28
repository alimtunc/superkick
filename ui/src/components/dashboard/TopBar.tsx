import { Button } from '@/components/ui/button'
import type { Run } from '@/types'
import { Link } from '@tanstack/react-router'

interface TopBarProps {
	lastRefresh: Date
	needsAttention: Run[]
	loading: boolean
	onRefresh: () => void
}

export function TopBar({ lastRefresh, needsAttention, loading, onRefresh }: TopBarProps) {
	return (
		<header className="sticky top-0 z-50 border-b border-edge bg-carbon/90 backdrop-blur-md">
			<div className="mx-auto flex h-12 max-w-360 items-center justify-between px-5">
				<div className="flex items-center gap-3">
					<div className="flex items-center gap-2">
						<div className="live-pulse h-2 w-2 rounded-full bg-neon-green" />
						<span className="font-data text-[11px] tracking-wider text-silver uppercase">
							Superkick
						</span>
					</div>
					<span className="text-dim">/</span>
					<span className="text-sm font-medium text-fog">Control Center</span>
				</div>
				<div className="flex items-center gap-4">
					<span className="font-data text-[11px] text-dim">
						{lastRefresh.toLocaleTimeString([], {
							hour: '2-digit',
							minute: '2-digit',
							second: '2-digit'
						})}
					</span>
					{needsAttention.length > 0 && (
						<Link
							to="/runs/$runId"
							params={{ runId: needsAttention[0].id }}
							className="font-data text-[11px] text-oxide transition-colors hover:text-oxide/80"
						>
							{needsAttention.length} alert{needsAttention.length > 1 ? 's' : ''}
						</Link>
					)}
					<Button
						variant="outline"
						size="xs"
						onClick={onRefresh}
						disabled={loading}
						className="font-data text-[11px] text-silver hover:text-fog"
					>
						{loading ? '...' : 'REFRESH'}
					</Button>
				</div>
			</div>
		</header>
	)
}
