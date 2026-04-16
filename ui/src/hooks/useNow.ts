import { useSyncExternalStore } from 'react'

/**
 * Shared wall-clock ticker. A single `setInterval` feeds every duration
 * display in the app — the previous pattern of deriving `refTime` from
 * `dataUpdatedAt` only advanced when TanStack Query refetched, so the
 * elapsed labels ("48s", "1m 12s") stayed frozen between refreshes.
 *
 * `useSyncExternalStore` means React subscribes to the singleton once per
 * consumer; the interval is started lazily when the first subscriber
 * mounts and stopped when the last one unmounts — zero cost when the UI
 * is backgrounded (no consumers → no timer).
 */

const TICK_INTERVAL_MS = 1000

let currentNow = Date.now()
let timerId: ReturnType<typeof setInterval> | null = null
const listeners = new Set<() => void>()

function tick() {
	currentNow = Date.now()
	for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener)
	if (timerId === null) {
		currentNow = Date.now()
		timerId = setInterval(tick, TICK_INTERVAL_MS)
	}
	return () => {
		listeners.delete(listener)
		if (listeners.size === 0 && timerId !== null) {
			clearInterval(timerId)
			timerId = null
		}
	}
}

function getSnapshot(): number {
	return currentNow
}

/**
 * Returns the current wall-clock timestamp, ticking every second so
 * elapsed-time labels animate live without waiting for a data refetch.
 */
export function useNow(): number {
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
