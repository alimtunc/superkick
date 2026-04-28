import { Pill } from '@/components/ui/pill'
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
		<Pill
			tone="cyan"
			size="xs"
			shape="round"
			title={item.reason}
			leading={<span className="h-1.5 w-1.5 rounded-full bg-cyan" aria-hidden="true" />}
		>
			{label}
		</Pill>
	)
}
