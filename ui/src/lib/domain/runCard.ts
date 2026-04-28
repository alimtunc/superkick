import type { QueueRunSummary } from '@/types'

import { fmtDuration, fmtElapsed } from './formatters'
import { isTerminalRunState } from './runState'

/**
 * Pick the most informative single-line message for a run card. Server-supplied
 * `reason` wins (it already encodes queue-bucket context); fall back to
 * pause/error so we never render a blank reason slot when the backend has
 * something to say.
 */
export function pickRunReason(run: QueueRunSummary): string | null {
	if (run.reason) return run.reason
	if (run.pause_reason) return run.pause_reason
	if (run.error_message) return run.error_message
	return null
}

/**
 * Format the elapsed-time pill for a run card. Terminal runs display
 * `finished_at - started_at` (a fixed duration); live runs tick off the wall
 * clock so the card reflows once per second.
 */
export function fmtRunElapsed(run: QueueRunSummary, refTime: number): string {
	if (isTerminalRunState(run.state) && run.finished_at) {
		return fmtDuration(new Date(run.finished_at).getTime() - new Date(run.started_at).getTime())
	}
	return fmtElapsed(run.started_at, refTime)
}
