import { useMemo } from 'react'

import { useActiveTakeovers } from '@/hooks/useTerminalTakeover'
import { deriveConversationUxState, summarizeAttention } from '@/lib/domain'
import { conversationDetailQuery, runDetailQuery } from '@/lib/queries'
import type { ConversationSubject, ConversationSummary, ConversationUxState } from '@/types'
import { useQuery } from '@tanstack/react-query'

/**
 * SUP-110 — derive the per-conversation badge state for the chat sidebar.
 *
 * Two sources of enrichment beyond `ConversationSummary`:
 *  - run subjects fold in `useRunDetail` + `useActiveTakeovers` so badges
 *    show "needs human" / "taken over" without each row fetching anything;
 *  - the *selected* conversation also folds in its turn detail (already in
 *    cache via `useConversationView`) so an in-flight turn flips the badge
 *    to "running" instead of being mis-derived as "completed" from the
 *    summary's `last_turn_at`.
 *
 * Returns `undefined` when there's nothing to enrich beyond the summary
 * (issue subject + no selection) so the sidebar can short-circuit.
 */
export function useChatSubjectStates(
	subject: ConversationSubject,
	conversations: readonly ConversationSummary[],
	selectedConversationId: string | null
): Record<string, ConversationUxState> | undefined {
	const isRun = subject.kind === 'run'
	const runId = isRun ? subject.run_id : null

	// `runDetailQuery(null)` returns a `skipToken`-backed query; non-run
	// subjects park on a dedicated `['runs','detail','pending']` key rather
	// than collide with a real run's cache entry.
	const runDetail = useQuery(runDetailQuery(runId))
	const activeTakeovers = useActiveTakeovers(runId ?? '', isRun)

	// Same query options as `useConversationView`, so the sidebar reads the
	// same cache entry — no duplicate fetch.
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
