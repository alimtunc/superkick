import { Button } from '@/components/ui/button'
import { useDashboardRuns } from '@/hooks/useDashboardRuns'
import { Link } from '@tanstack/react-router'

export function ShellHeader() {
	const d = useDashboardRuns()

	return (
		<header className="sticky top-0 z-40 flex h-12 shrink-0 items-center justify-between border-b border-edge bg-carbon/90 px-5 backdrop-blur-md">
			<div className="flex items-center gap-3">
				<span className="font-data text-[11px] text-dim">
					{d.lastRefresh.toLocaleTimeString([], {
						hour: '2-digit',
						minute: '2-digit',
						second: '2-digit',
					})}
				</span>
				{d.active.length > 0 ? (
					<span className="font-data text-[11px] text-cyan">
						{d.active.length} active
					</span>
				) : null}
			</div>
			<div className="flex items-center gap-4">
				{d.needsAttention.length > 0 ? (
					<Link
						to="/runs/$runId"
						params={{ runId: d.needsAttention[0].id }}
						className="font-data text-[11px] text-oxide transition-colors hover:text-oxide/80"
					>
						{d.needsAttention.length} alert{d.needsAttention.length > 1 ? 's' : ''}
					</Link>
				) : null}
				<Button
					variant="outline"
					size="xs"
					onClick={d.refresh}
					disabled={d.loading}
					className="font-data text-[11px] text-silver hover:text-fog"
				>
					{d.loading ? '...' : 'REFRESH'}
				</Button>
			</div>
		</header>
	)
}
