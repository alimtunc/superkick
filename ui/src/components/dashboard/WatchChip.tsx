import { Button } from '@/components/ui/button'
import { fmtElapsed, healthSignal, stepLabel } from '@/lib/domain'
import type { Run } from '@/types'

interface WatchChipProps {
	run: Run
	refTime: number
	isFocused: boolean
	onUnwatch: () => void
}

const healthBarColor = {
	critical: 'bg-oxide',
	warning: 'bg-gold',
	ok: 'bg-mineral'
} as const

export function WatchChip({ run, refTime, isFocused, onUnwatch }: WatchChipProps) {
	const sig = healthSignal(run, refTime)
	const dotColor = healthBarColor[sig]

	return (
		<span
			className={`group flex shrink-0 cursor-pointer items-center gap-2 rounded border px-2.5 py-1 transition-colors ${
				isFocused
					? 'border-mineral/40 bg-mineral-dim ring-1 ring-mineral/20'
					: 'border-edge bg-graphite hover:border-edge-bright'
			}`}
		>
			<span
				className={`h-1.5 w-1.5 rounded-full ${dotColor} ${sig === 'critical' ? 'live-pulse' : ''}`}
			/>
			<span
				className={`font-data text-[11px] transition-colors ${
					isFocused ? 'font-medium text-mineral' : 'text-fog group-hover:text-neon-green'
				}`}
			>
				{run.issue_identifier}
			</span>
			<span className="font-data text-[10px] text-dim">
				{run.current_step_key
					? (stepLabel[run.current_step_key] ?? run.current_step_key)
					: run.state.replace(/_/g, ' ')}
			</span>
			<span className="font-data text-[10px] text-dim">{fmtElapsed(run.started_at, refTime)}</span>
			<Button
				variant="ghost"
				size="icon-xs"
				onClick={(e) => {
					e.preventDefault()
					e.stopPropagation()
					onUnwatch()
				}}
				className="font-data ml-0.5 text-[10px] text-dim hover:text-oxide"
				title="Unwatch"
			>
				&times;
			</Button>
		</span>
	)
}
