import { type RefObject, useEffect, useRef } from 'react'

const NEAR_BOTTOM_PX = 80

// Pins a scroll container to the newest content whenever `signal` changes, but
// only while the reader is already near the bottom — an upward scroll to read
// history is never hijacked. Used by the live run feeds (Activity / Tool calls
// / Logs) so a running Codex turn auto-follows without manual scrolling.
export function useStickToBottom<T extends HTMLElement>(
	signal: unknown
): { ref: RefObject<T | null>; onScroll: () => void } {
	const ref = useRef<T>(null)
	const nearBottom = useRef(true)

	function onScroll() {
		const el = ref.current
		if (!el) return
		nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
	}

	useEffect(() => {
		const el = ref.current
		if (el && nearBottom.current) el.scrollTop = el.scrollHeight
	}, [signal])

	return { ref, onScroll }
}
