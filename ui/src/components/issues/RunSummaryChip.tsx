import { fmtElapsed, stepLabel } from '@/lib/domain'
import type { LaunchQueueItem } from '@/types'

interface RunSummaryChipProps {
	item: Extract<LaunchQueueItem, { kind: 'run' }>
	refTime: number
}

export function RunSummaryChip({ item, refTime }: RunSummaryChipProps) {
	const stepText = item.run.current_step_key
		? (stepLabel[item.run.current_step_key] ?? item.run.current_step_key)
		: null
	const elapsed = fmtElapsed(item.run.started_at, refTime)
	const label = stepText ? `${stepText} · ${elapsed}` : elapsed

	return (
		<span
			className="font-data inline-flex shrink-0 items-center gap-1 rounded-full border border-cyan/30 bg-cyan/5 px-2 py-0.5 text-[10px] text-cyan"
			title={item.reason}
		>
			<span className="h-1.5 w-1.5 rounded-full bg-cyan" aria-hidden="true" />
			{label}
		</span>
	)
}
