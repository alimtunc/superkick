import { useSyncExternalStore } from 'react'

import type { SseBroker } from '@/lib/eventBroker'

// Lets callers disable polling when SSE is live to avoid duplicate invalidation.
export function useBrokerConnected<E, F>(broker: SseBroker<E, F>): boolean {
	return useSyncExternalStore(
		(notify) => broker.subscribeConnection(() => notify()),
		() => broker.isConnected(),
		() => false
	)
}
