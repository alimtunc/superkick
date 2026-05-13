import type { LinkedPrSummary, QueueRunSummary } from '@/types'

interface RunPillSlots {
	attention: { count: number } | null
	interrupt: { count: number } | null
	pr: LinkedPrSummary | null
}

export function runPillSlots(run: QueueRunSummary): RunPillSlots {
	return {
		attention: run.pending_attention_count > 0 ? { count: run.pending_attention_count } : null,
		interrupt: run.pending_interrupt_count > 0 ? { count: run.pending_interrupt_count } : null,
		pr: run.pr ?? null
	}
}
