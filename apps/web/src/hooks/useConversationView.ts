import { useCallback, useMemo } from 'react'

import { cancelTurn, createTurn } from '@/api'
import { conversationDetailQuery } from '@/lib/queries'
import { queryKeys } from '@/lib/queryKeys'
import type { ChatPermissionMode, Turn } from '@/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

interface SendTurnOptions {
	mode?: ChatPermissionMode
	model?: string
}

interface UseConversationViewArgs {
	conversationId: string | null
	listKey?: readonly unknown[]
}

// Stable empty ref to avoid downstream rerenders while detail query is loading.
const EMPTY_TURNS: Turn[] = []

export function useConversationView(args: UseConversationViewArgs) {
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
