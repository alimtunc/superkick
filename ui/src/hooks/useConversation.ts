import { useCallback, useMemo } from 'react'

import { cancelTurn, createOrGetConversation, createTurn, fetchConversation } from '@/api'
import { queryKeys } from '@/lib/queryKeys'
import type {
	AgentProvider,
	ChatPermissionMode,
	Conversation,
	ConversationDetail,
	ConversationSubject,
	Turn
} from '@/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

function firstErrorMessage(...errors: Array<unknown>): string | null {
	for (const err of errors) {
		if (err) return String(err)
	}
	return null
}

interface OpenedConversationArgs {
	subject: ConversationSubject
	agentId: string
	provider: AgentProvider
	enabled?: boolean
}

export interface SendTurnOptions {
	mode?: ChatPermissionMode
	model?: string
}

export interface UseConversationResult {
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

/**
 * Open (or fetch) the conversation for a `(subject, agent_id)` pair, then
 * load its full transcript. Mutations (`send`, `cancelActiveTurn`)
 * invalidate the detail query so persisted state stays the source of truth
 * — live deltas come through `useTurnStream` once a turn is in flight.
 */
export function useConversation(args: OpenedConversationArgs): UseConversationResult {
	const { subject, agentId, provider, enabled = true } = args
	const queryClient = useQueryClient()

	const openQuery = useQuery({
		queryKey: ['conversations', 'open', subjectKey(subject), agentId, provider] as const,
		queryFn: () => createOrGetConversation({ subject, agent_id: agentId, provider }),
		enabled,
		staleTime: 60_000
	})

	const conversationId = openQuery.data?.id ?? null

	const detailQuery = useQuery({
		queryKey: conversationId
			? queryKeys.conversations.detail(conversationId)
			: ['conversations', 'detail', 'pending'],
		queryFn: () => {
			if (!conversationId) throw new Error('conversation id missing')
			return fetchConversation(conversationId)
		},
		enabled: enabled && conversationId !== null,
		staleTime: 5_000
	})

	const turns = useMemo(() => detailQuery.data?.turns ?? [], [detailQuery.data?.turns])
	const conversation = detailQuery.data?.conversation ?? openQuery.data ?? null

	const activeTurnId = useMemo(() => {
		const active = turns.find((t) => t.status === 'pending' || t.status === 'streaming')
		return active?.id ?? null
	}, [turns])

	const syncDetail = useCallback(() => {
		if (!conversationId) return
		queryClient.invalidateQueries({ queryKey: queryKeys.conversations.detail(conversationId) })
	}, [conversationId, queryClient])

	const sendMutation = useMutation({
		mutationFn: async (params: { userText: string; options?: SendTurnOptions }) => {
			if (!conversationId) throw new Error('conversation not opened yet')
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
		loading: openQuery.isLoading || detailQuery.isLoading,
		error: firstErrorMessage(openQuery.error, detailQuery.error),
		activeTurnId,
		send,
		sending: sendMutation.isPending,
		sendError: sendMutation.error ? String(sendMutation.error) : null,
		cancelActiveTurn,
		cancelling: cancelMutation.isPending,
		refetch: () => {
			openQuery.refetch()
			detailQuery.refetch()
		},
		syncDetail
	}
}

function subjectKey(subject: ConversationSubject): string {
	if (subject.kind === 'issue') return `issue:${subject.identifier}`
	return `run:${subject.run_id}`
}
