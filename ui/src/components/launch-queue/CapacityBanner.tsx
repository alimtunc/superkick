import { Pill } from '@/components/ui/pill'
import type { LaunchQueueActiveCapacity } from '@/types'

interface CapacityBannerProps {
	capacity: LaunchQueueActiveCapacity
	generatedAt: string | null
}

export function CapacityBanner({ capacity, generatedAt }: CapacityBannerProps) {
	const saturated = capacity.current >= capacity.max && capacity.max > 0
	const refreshed = generatedAt ? `refreshed ${new Date(generatedAt).toLocaleTimeString()}` : null

	return (
		<div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface px-3.5 py-2">
			<Pill tone={saturated ? 'warn' : 'neutral'} size="sm" mono>
				{capacity.current}/{capacity.max} active runs
			</Pill>
			<p className="text-[12px] text-fg-muted">
				{saturated
					? 'concurrency cap reached — new launches will queue under Waiting — capacity'
					: 'capacity available — launchable issues can be dispatched'}
			</p>
			{refreshed ? (
				<span className="ml-auto font-mono text-[11px] text-fg-dim">{refreshed}</span>
			) : null}
		</div>
	)
}
