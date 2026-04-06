import type { ExecutionMode } from '@/types'

const modeStyle: Record<ExecutionMode, string> = {
	full_auto: 'bg-mineral-dim text-mineral',
	semi_auto: 'bg-amber-500/10 text-amber-400'
}

const modeLabel: Record<ExecutionMode, string> = {
	full_auto: 'AUTO',
	semi_auto: 'SEMI'
}

interface ExecutionModeBadgeProps {
	mode: ExecutionMode
}

export function ExecutionModeBadge({ mode }: ExecutionModeBadgeProps) {
	return (
		<span
			className={`font-data inline-block rounded px-2 py-0.5 text-[10px] font-medium ${modeStyle[mode]}`}
			title={
				mode === 'full_auto' ? 'Fully autonomous execution' : 'Semi-auto — pauses for operator review'
			}
		>
			{modeLabel[mode]}
		</span>
	)
}
