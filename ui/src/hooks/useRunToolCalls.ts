import { useMemo } from 'react'

import { deriveProtocolToolCalls, hasProtocolActivity } from '@/lib/domain'
import { runToolCallsQuery } from '@/lib/queries'
import type { RunEvent, RunToolCall } from '@/types'
import { useQuery } from '@tanstack/react-query'

export interface UseRunToolCallsResult {
	calls: RunToolCall[]
	isLoading: boolean
	error: unknown
}

// A launch-task Codex step is a shadow run with no conversation, so the
// conversations projection (`runToolCallsQuery`) is empty. When the run carries
// `agent_protocol` events we derive the calls from those instead; chat runs keep
// the conversation-based source.
export function useRunToolCalls(runId: string, events: readonly RunEvent[]): UseRunToolCallsResult {
	const fromProtocol = hasProtocolActivity(events)
	const query = useQuery({ ...runToolCallsQuery(runId), enabled: !fromProtocol })

	const protocolCalls = useMemo(() => deriveProtocolToolCalls(events), [events])

	if (fromProtocol) {
		return { calls: protocolCalls, isLoading: false, error: null }
	}
	return { calls: query.data ?? [], isLoading: query.isLoading, error: query.error }
}
