import { TERMINAL_STATES } from '@/lib/constants'
import type { RunState } from '@/types'

interface RunStateLike {
	state: RunState
}

export function isTerminalRunState(state: RunState): boolean {
	return TERMINAL_STATES.has(state)
}

export function isActiveRun(run: RunStateLike | null | undefined): boolean {
	if (!run) return false
	return !TERMINAL_STATES.has(run.state)
}

export function pickLatestRun<T extends { started_at: string }>(runs: readonly T[]): T | null {
	let latest: T | null = null
	let latestTs = -Infinity
	for (const run of runs) {
		const ts = new Date(run.started_at).getTime()
		if (ts > latestTs) {
			latestTs = ts
			latest = run
		}
	}
	return latest
}
