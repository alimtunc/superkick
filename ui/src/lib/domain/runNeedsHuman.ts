import type { AttentionRequest, Run } from '@/types'

export function runNeedsHuman(run: Run, attentionRequests: readonly AttentionRequest[]): boolean {
	if (run.state === 'waiting_human') return true
	if (run.pause_kind === 'approval' || run.pause_kind === 'budget') return true
	return attentionRequests.some((r) => r.status === 'pending')
}
