import { Pill, type PillTone } from '@/components/ui/pill'
import type { LaunchTaskStatus } from '@/types'

const STATUS_TONE: Record<LaunchTaskStatus, PillTone> = {
	pending: 'neutral',
	running: 'cyan',
	needs_human: 'gold',
	completed: 'mineral',
	failed: 'oxide',
	cancelled: 'neutral'
}

const STATUS_LABEL: Record<LaunchTaskStatus, string> = {
	pending: 'Pending',
	running: 'Running',
	needs_human: 'Needs you',
	completed: 'Completed',
	failed: 'Failed',
	cancelled: 'Cancelled'
}

export function LaunchTaskStatusBadge({ status }: { status: LaunchTaskStatus }) {
	return (
		<Pill tone={STATUS_TONE[status]} size="sm">
			{STATUS_LABEL[status]}
		</Pill>
	)
}
