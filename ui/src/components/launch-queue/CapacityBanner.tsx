import type { LaunchQueueActiveCapacity } from '@/types'

interface CapacityBannerProps {
	capacity: LaunchQueueActiveCapacity
	generatedAt: string | null
}

export function CapacityBanner({ capacity, generatedAt }: CapacityBannerProps) {
	const saturated = capacity.current >= capacity.max && capacity.max > 0
	const toneClass = saturated ? 'text-gold' : 'text-silver'
	const refreshed = generatedAt ? `refreshed ${new Date(generatedAt).toLocaleTimeString()}` : null

	return (
		<div className="panel flex flex-wrap items-center gap-4 px-4 py-2">
			<p className={`font-data text-[12px] tracking-wider uppercase ${toneClass}`}>
				{capacity.current}/{capacity.max} active runs
			</p>
			<p className="font-data text-[11px] text-dim">
				{saturated
					? 'concurrency cap reached — new launches will queue under Waiting — capacity'
					: 'capacity available — launchable issues can be dispatched'}
			</p>
			{refreshed ? <p className="font-data ml-auto text-[10px] text-dim">{refreshed}</p> : null}
		</div>
	)
}
