import { useSyncExternalStore } from 'react'

import type { SseBroker } from '@/lib/eventBroker'

/**
 * Subscribe to an SSE broker's connection state. Returns `true` while the
 * stream is live and `false` while it is between reconnects. Callers use this
 * to gate fallback polling — once SSE is reporting events, refetch loops are
 * pure waste and they collide with the broker's own invalidation.
 */
export function useBrokerConnected<E, F>(broker: SseBroker<E, F>): boolean {
	return useSyncExternalStore(
		(notify) => broker.subscribeConnection(() => notify()),
		() => broker.isConnected(),
		() => false
	)
}
