import { RunningDurationLabel } from '@/components/issue-detail/RunningDurationLabel'
import { fmtDuration } from '@/lib/domain'

interface RunDurationLabelProps {
	startedAt: string
	finishedAt: string | null
}

export function RunDurationLabel({ startedAt, finishedAt }: RunDurationLabelProps) {
	if (!finishedAt) return <RunningDurationLabel startedAt={startedAt} />
	const duration = fmtDuration(new Date(finishedAt).getTime() - new Date(startedAt).getTime())
	return <span className="font-data text-[10px] text-dim">took {duration}</span>
}
