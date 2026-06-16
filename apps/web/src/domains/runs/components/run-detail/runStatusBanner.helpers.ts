import type { Run } from '@/types'

export function isApprovalPaused(run: Run): boolean {
	return run.pause_kind === 'approval'
}

export function isBudgetPaused(run: Run): boolean {
	return run.pause_kind === 'budget'
}

export function shipSummary(run: Run): string {
	if (run.state === 'completed') return 'Run completed successfully.'
	if (run.state === 'failed') return run.error_message ?? 'Run failed.'
	if (run.state === 'cancelled') return 'Run was cancelled.'
	return 'Run finished.'
}

export function pauseTitle(run: Run): string {
	if (isBudgetPaused(run)) return 'Budget tripped'
	if (isApprovalPaused(run)) return 'Approval required'
	return 'Needs your decision'
}
