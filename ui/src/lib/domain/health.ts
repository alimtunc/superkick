import type { Run, RunState } from '@/types'

import { HEALTH_WARNING_THRESHOLD_MS } from '../constants'
import { elapsedMs } from './formatters'

type HealthSignal = 'critical' | 'warning' | 'ok'

export function healthSignal(run: Run, refTime: number): HealthSignal {
	if (run.state === 'waiting_human' || run.state === 'failed') return 'critical'
	if (elapsedMs(run.started_at, refTime) > HEALTH_WARNING_THRESHOLD_MS) return 'warning'
	return 'ok'
}

export const healthSignalBg: Record<HealthSignal, string> = {
	critical: 'bg-oxide',
	warning: 'bg-gold',
	ok: 'bg-mineral'
}

export function shouldShowInterrupts(state: RunState, interruptCount: number): boolean {
	return interruptCount > 0 || state === 'waiting_human'
}
