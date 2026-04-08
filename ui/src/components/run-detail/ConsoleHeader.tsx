import type { ExecutionMode } from '@/types'

export function ConsoleHeader({
	connected,
	done,
	executionMode,
	eventCount
}: {
	connected: boolean
	done: boolean
	executionMode: ExecutionMode | undefined
	eventCount: number
}) {
	const modeLabel = executionMode === 'semi_auto' ? 'SEMI-AUTO' : 'FULL-AUTO'
	const modeColor = executionMode === 'semi_auto' ? 'text-gold' : 'text-mineral'

	return (
		<div className="flex items-center gap-3 border-b border-edge px-3 py-2 text-[11px]">
			<span className="font-data font-medium tracking-wider text-silver">CONSOLE</span>
			<span className={`font-data ${modeColor}`}>{modeLabel}</span>
			{connected ? (
				<span className="font-data flex items-center gap-1.5 text-neon-green">
					<span className="live-pulse inline-block h-1.5 w-1.5 rounded-full bg-neon-green" />
					LIVE
				</span>
			) : null}
			{done ? <span className="font-data text-dim">Stream ended</span> : null}
			<span className="font-data ml-auto text-dim">{eventCount}</span>
		</div>
	)
}
