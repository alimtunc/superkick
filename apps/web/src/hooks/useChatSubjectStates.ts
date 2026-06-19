import { useMemo } from 'react'

import { useActiveTakeovers } from '@/hooks/useTerminalTakeover'
import { deriveConversationUxState, summarizeAttention } from '@/lib/domain'
import { conversationDetailQuery, runDetailQuery } from '@/lib/queries'
import type { ConversationSubject, ConversationSummary, ConversationUxState } from '@/types'
import { useQuery } from '@tanstack/react-query'

export function useChatSubjectStates(
	subject: ConversationSubject,
	conversations: readonly ConversationSummary[],
	selectedConversationId: string | null
): Record<string, ConversationUxState> | undefined {
	const isRun = subject.kind === 'run'
	const runId = isRun ? subject.run_id : null

	const runDetail = useQuery(runDetailQuery(runId))
	const activeTakeovers = useActiveTakeovers(runId ?? '', isRun)

	// Same query options as `useConversationView`, so this reads the shared cache entry rather than refetching.
	const selectedDetail = useQuery(conversationDetailQuery(selectedConversationId))

	return useMemo(() => {
		const run = runDetail.data?.run ?? null
		const attentionRequests = runDetail.data?.attention_requests ?? []
		const interrupts = runDetail.data?.interrupts ?? []
		const attention = summarizeAttention(attentionRequests, interrupts)
		const takeovers = activeTakeovers.data?.takeovers ?? []
		const selectedTurns =
			selectedDetail.data?.conversation.id === selectedConversationId
				? (selectedDetail.data?.turns ?? null)
				: null

		if (!isRun && selectedTurns === null) return undefined

		const map: Record<string, ConversationUxState> = {}
		for (const conv of conversations) {
			const turns = conv.id === selectedConversationId ? selectedTurns : null
			map[conv.id] = deriveConversationUxState({
				conversation: conv,
				turns,
				run: isRun ? run : null,
				takeovers: isRun ? takeovers : null,
				attention: isRun ? attention : null
			})
		}
		return map
	}, [
		isRun,
		runDetail.data,
		activeTakeovers.data,
		selectedDetail.data,
		selectedConversationId,
		conversations
	])
}
