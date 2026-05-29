import { useEffect, useState } from 'react'

import { useBrokerConnected } from '@/hooks/useBrokerConnection'
import { workspaceEventBroker } from '@/lib/eventBroker'

const DOWN_DELAY_MS = 8000

/**
 * Pins under the topbar when the local daemon stream drops. Debounced generously
 * so the daemon's normal startup/restart window (build + boot) never flashes a
 * false "disconnected"; only a sustained outage surfaces the banner.
 */
export function ConnectionBanner() {
	const connected = useBrokerConnected(workspaceEventBroker)
	const [showDown, setShowDown] = useState(false)

	useEffect(() => {
		if (connected) {
			setShowDown(false)
			return
		}
		const timer = setTimeout(() => setShowDown(true), DOWN_DELAY_MS)
		return () => clearTimeout(timer)
	}, [connected])

	if (!showDown) return null

	return (
		<div className="connbar connbar--down" role="status">
			<span className="dot" />
			<strong>Daemon disconnected</strong>
			<span>— superkickd isn't responding. Reconnecting…</span>
			<span className="spacer" />
			<button
				type="button"
				className="btn btn--sm btn--danger"
				onClick={() => workspaceEventBroker.start()}
			>
				Retry
			</button>
		</div>
	)
}
