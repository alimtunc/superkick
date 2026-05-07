import { Pill, type PillTone } from '@/components/ui/pill'
import type { LaunchTaskStepStatus } from '@/types'

const STATUS_TONE: Record<LaunchTaskStepStatus, PillTone> = {
	pending: 'neutral',
	running: 'cyan',
	needs_human: 'gold',
	completed: 'mineral',
	failed: 'oxide',
	skipped: 'neutral',
	cancelled: 'neutral'
}

const STATUS_LABEL: Record<LaunchTaskStepStatus, string> = {
	pending: 'Pending',
	running: 'Running',
	needs_human: 'Needs you',
	completed: 'Done',
	failed: 'Failed',
	skipped: 'Skipped',
	cancelled: 'Cancelled'
}

export function LaunchStepStatusBadge({ status }: { status: LaunchTaskStepStatus }) {
	return (
		<Pill tone={STATUS_TONE[status]} size="xs">
			{STATUS_LABEL[status]}
		</Pill>
	)
}
