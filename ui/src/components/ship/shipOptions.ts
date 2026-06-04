import type { LinearStatusChoice, ShipMode } from '@/types'

export const SHIP_MODE_OPTIONS: ReadonlyArray<{ value: ShipMode; label: string; hint: string }> = [
	{ value: 'draft', label: 'Draft PR', hint: 'Open a draft pull request' },
	{ value: 'ready', label: 'Ready PR', hint: 'Open a ready-for-review pull request' },
	{ value: 'push_only', label: 'Push branch only', hint: 'Push the branch, no PR' }
]

export const SHIP_MODE_SUBMIT_LABEL: Record<ShipMode, string> = {
	draft: 'Create draft PR',
	ready: 'Create ready PR',
	push_only: 'Push branch'
}

export const LINEAR_STATUS_OPTIONS: ReadonlyArray<{ value: LinearStatusChoice; label: string }> = [
	{ value: 'no_change', label: 'No change' },
	{ value: 'in_review', label: 'In Review' },
	{ value: 'done', label: 'Done' }
]
