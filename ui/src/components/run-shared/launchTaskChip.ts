import type { RunChipVariant } from '@/components/run-shared/RunChip'
import type { LaunchTaskStatus } from '@/types'

interface LaunchTaskChipMeta {
	variant: RunChipVariant
	label: string
}

const LAUNCH_TASK_CHIP: Record<LaunchTaskStatus, LaunchTaskChipMeta> = {
	pending: { variant: 'running', label: 'Pending' },
	running: { variant: 'running', label: 'Running' },
	needs_human: { variant: 'needs', label: 'Needs you' },
	completed: { variant: 'done', label: 'Completed' },
	failed: { variant: 'failed', label: 'Failed' },
	cancelled: { variant: 'failed', label: 'Cancelled' }
}

export function launchTaskChip(status: LaunchTaskStatus): LaunchTaskChipMeta {
	return LAUNCH_TASK_CHIP[status]
}
