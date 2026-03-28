import type { RunState } from '@/types'

export const TERMINAL_STATES = new Set<RunState>(['completed', 'failed', 'cancelled'])

/** Minutes before a run appears in the ATTENTION "aging" zone */
export const AGING_THRESHOLD_MS = 20 * 60_000
/** Minutes before a run's health signal turns "warning" */
export const HEALTH_WARNING_THRESHOLD_MS = 30 * 60_000
