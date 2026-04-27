import { useNow } from '@/hooks/useNow'
import { fmtElapsed } from '@/lib/domain'

interface RunningDurationLabelProps {
	startedAt: string
}

export function RunningDurationLabel({ startedAt }: RunningDurationLabelProps) {
	const refTime = useNow()
	return <span className="font-data text-[10px] text-dim">running {fmtElapsed(startedAt, refTime)}</span>
}
