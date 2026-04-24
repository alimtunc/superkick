/** Window during which an issue that transitioned out of Blocked carries an
 *  "unblocked" badge — SUP-81 criterion 5. Session-local; the badge disappears
 *  across reloads by design (no new stored state). */
export const UNBLOCK_BADGE_WINDOW_MS = 24 * 60 * 60 * 1000

/** True when `resolvedAt` falls within the session-local badge window
 *  anchored at `nowMs` (epoch millis). */
export function isWithinUnblockWindow(resolvedAt: string, nowMs: number): boolean {
	const ts = Date.parse(resolvedAt)
	if (Number.isNaN(ts)) return false
	return nowMs - ts < UNBLOCK_BADGE_WINDOW_MS
}
