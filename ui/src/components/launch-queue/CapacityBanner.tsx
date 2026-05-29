import type { LaunchQueueActiveCapacity } from '@/types'

interface CapacityBannerProps {
	capacity: LaunchQueueActiveCapacity
	generatedAt: string | null
}

export function CapacityBanner({ capacity, generatedAt }: CapacityBannerProps) {
	const saturated = capacity.current >= capacity.max && capacity.max > 0
	const refreshed = generatedAt ? `refreshed ${new Date(generatedAt).toLocaleTimeString()}` : null
	const pct = capacity.max > 0 ? Math.min(100, Math.round((capacity.current / capacity.max) * 100)) : 0

	return (
		<div className="flex flex-wrap items-center gap-4">
			<span className="text-[14px] font-semibold text-fg">Active capacity</span>
			<div
				style={{
					flex: 1,
					maxWidth: '200px',
					height: '6px',
					borderRadius: 'var(--radius-full)',
					background: 'var(--bg-input)',
					overflow: 'hidden'
				}}
			>
				<div
					style={{
						width: `${pct}%`,
						height: '100%',
						background: saturated ? 'var(--warn)' : 'var(--accent)'
					}}
				/>
			</div>
			<span className="mono text-[12px] text-fg-muted">
				{capacity.current} / {capacity.max} running
			</span>
			<p className="text-[12px] text-fg-dim">
				{saturated
					? 'concurrency cap reached — new launches will queue under Waiting'
					: 'capacity available — launchable issues can be dispatched'}
			</p>
			{refreshed ? <span className="mono ml-auto text-[11px] text-fg-dim">{refreshed}</span> : null}
		</div>
	)
}
