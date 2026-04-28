import { Pill, type PillTone } from '@/components/ui/pill'
import type { ExecutionMode } from '@/types'

const modeTone: Record<ExecutionMode, PillTone> = {
	full_auto: 'mineral',
	semi_auto: 'gold'
}

const modeLabel: Record<ExecutionMode, string> = {
	full_auto: 'AUTO',
	semi_auto: 'SEMI'
}

const modeTitle: Record<ExecutionMode, string> = {
	full_auto: 'Fully autonomous execution',
	semi_auto: 'Semi-auto — pauses for operator review'
}

interface ExecutionModeBadgeProps {
	mode: ExecutionMode
}

export function ExecutionModeBadge({ mode }: ExecutionModeBadgeProps) {
	return (
		<Pill tone={modeTone[mode]} size="xs" title={modeTitle[mode]}>
			{modeLabel[mode]}
		</Pill>
	)
}
