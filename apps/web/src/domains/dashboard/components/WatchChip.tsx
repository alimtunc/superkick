import { Button } from '@/components/primitives'
import { fmtElapsed, healthSignal, healthSignalBg, stepLabel } from '@/lib/domain'
import { cn } from '@/lib/utils'
import type { Run } from '@/types'
import { X } from 'lucide-react'

interface WatchChipProps {
	run: Run
	refTime: number
	isFocused: boolean
	onUnwatch: () => void
}

export function WatchChip({ run, refTime, isFocused, onUnwatch }: WatchChipProps) {
	const sig = healthSignal(run, refTime)
	const dotColor = healthSignalBg[sig]

	return (
		<span
			className={cn(
				'group flex shrink-0 cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1 transition-colors',
				isFocused
					? 'border-success/40 bg-success-soft ring-1 ring-success/20'
					: 'border-border bg-surface hover:border-border-strong hover:bg-raised/40'
			)}
		>
			<span
				className={cn('h-1.5 w-1.5 rounded-full', dotColor, sig === 'critical' ? 'sk-pulse' : '')}
				aria-hidden="true"
			/>
			<span
				className={cn(
					'font-data text-[11px] transition-colors',
					isFocused ? 'font-medium text-success' : 'text-fg group-hover:text-success'
				)}
			>
				{run.issue_identifier}
			</span>
			<span className="font-data text-[10px] text-fg-dim">
				{run.current_step_key
					? (stepLabel[run.current_step_key] ?? run.current_step_key)
					: run.state.replace(/_/g, ' ')}
			</span>
			<span className="font-data text-[10px] text-fg-dim">{fmtElapsed(run.started_at, refTime)}</span>
			<Button
				variant="ghost"
				size="icon-xs"
				onClick={(e) => {
					e.preventDefault()
					e.stopPropagation()
					onUnwatch()
				}}
				className="ml-0.5 text-fg-dim hover:text-danger"
				title="Unwatch"
				aria-label="Unwatch"
			>
				<X size={11} aria-hidden="true" />
			</Button>
		</span>
	)
}
