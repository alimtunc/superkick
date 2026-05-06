import { useCallback, useMemo } from 'react'

import { cancelTurn, createTurn } from '@/api'
import { conversationDetailQuery } from '@/lib/queries'
import { queryKeys } from '@/lib/queryKeys'
import type { ChatPermissionMode, Conversation, ConversationDetail, Turn } from '@/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export interface SendTurnOptions {
	mode?: ChatPermissionMode
	model?: string
}

export interface UseConversationViewResult {
	conversation: Conversation | null
	turns: Turn[]
	detail: ConversationDetail | null
	loading: boolean
	error: string | null
	activeTurnId: string | null
	send: (userText: string, options?: SendTurnOptions) => Promise<void>
	sending: boolean
	sendError: string | null
	cancelActiveTurn: () => Promise<void>
	cancelling: boolean
	refetch: () => void
	syncDetail: () => void
}

interface UseConversationViewArgs {
	conversationId: string | null
	/**
	 * Sidebar list cache key to invalidate after sending a turn so the
	 * "recent activity" sort updates without a manual refetch.
	 */
	listKey?: readonly unknown[]
}

// Stable empty-turns reference so downstream `useMemo([turns])` consumers
// don't re-run on every render while the detail query is loading.
const EMPTY_TURNS: Turn[] = []

/**
 * View a single conversation by id. Distinct from `useConversationsList`
 * (which feeds the sidebar) and from the old `useConversation` hook (which
 * also created on demand — SUP-107 split that responsibility into a
 * dedicated `+ New chat` flow).
 */
export function useConversationView(args: UseConversationViewArgs): UseConversationViewResult {
	const { conversationId, listKey } = args
	const queryClient = useQueryClient()

	const detailQuery = useQuery(conversationDetailQuery(conversationId))

	const turns = detailQuery.data?.turns ?? EMPTY_TURNS
	const conversation = detailQuery.data?.conversation ?? null

	const activeTurnId = useMemo(() => {
		const active = turns.find((turn) => turn.status === 'pending' || turn.status === 'streaming')
		return active?.id ?? null
	}, [turns])

	const syncDetail = useCallback(() => {
		if (!conversationId) return
		queryClient.invalidateQueries({ queryKey: queryKeys.conversations.detail(conversationId) })
		if (listKey) queryClient.invalidateQueries({ queryKey: listKey })
	}, [conversationId, listKey, queryClient])

	const sendMutation = useMutation({
		mutationFn: async (params: { userText: string; options?: SendTurnOptions }) => {
			if (!conversationId) throw new Error('no conversation selected')
			return createTurn(conversationId, {
				user_text: params.userText,
				permission_mode: params.options?.mode,
				model: params.options?.model
			})
		},
		onSuccess: () => syncDetail()
	})

	const cancelMutation = useMutation({
		mutationFn: async () => {
			if (!conversationId || !activeTurnId) return
			await cancelTurn(conversationId, activeTurnId)
		},
		onSuccess: () => syncDetail()
	})

	const send = useCallback(
		async (userText: string, options?: SendTurnOptions) => {
			await sendMutation.mutateAsync({ userText, options })
		},
		[sendMutation]
	)

	const cancelActiveTurn = useCallback(async () => {
		await cancelMutation.mutateAsync()
	}, [cancelMutation])

	return {
		conversation,
		turns,
		detail: detailQuery.data ?? null,
		loading: detailQuery.isLoading,
		error: detailQuery.error ? String(detailQuery.error) : null,
		activeTurnId,
		send,
		sending: sendMutation.isPending,
		sendError: sendMutation.error ? String(sendMutation.error) : null,
		cancelActiveTurn,
		cancelling: cancelMutation.isPending,
		refetch: () => {
			detailQuery.refetch()
		},
		syncDetail
	}
}
