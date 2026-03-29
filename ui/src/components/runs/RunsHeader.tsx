import { Button } from '@/components/ui/button'

export function RunsHeader({
	total,
	activeCount,
	loading,
	onRefresh
}: {
	total: number
	activeCount: number
	loading: boolean
	onRefresh: () => void
}) {
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
				<Button
					variant="outline"
					size="xs"
					onClick={onRefresh}
					disabled={loading}
					className="font-data text-[11px] text-dim hover:text-silver"
				>
					{loading ? '...' : 'REFRESH'}
				</Button>
			</div>
		</header>
	)
}
