import type { QueueRunSummary } from '@/types'
import type { SKTone } from '@/types/icons'

export function runningNowTone(run: QueueRunSummary): SKTone {
	if (run.state === 'failed') return 'danger'
	if (run.stalled_for_seconds != null) return 'warn'
	if (run.pending_attention_count > 0 || run.pending_interrupt_count > 0) return 'warn'
	return 'info'
}

export function runningNowPillLabel(run: QueueRunSummary): string {
	if (run.state === 'failed') return 'failed'
	if (run.stalled_for_seconds != null) return 'stalled'
	if (run.pending_interrupt_count > 0) return 'interrupt'
	if (run.pending_attention_count > 0) return 'attention'
	return 'running'
}
