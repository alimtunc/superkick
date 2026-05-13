import { useCallback, useState } from 'react'

import { createConversation } from '@/api'
import { ChatComposer } from '@/components/chat/ChatComposer'
import { subjectKey } from '@/lib/conversations'
import { queryKeys } from '@/lib/queryKeys'
import type { AgentProvider, ChatPermissionMode, ConversationSubject } from '@/types'
import { useQueryClient } from '@tanstack/react-query'

interface NewChatLauncherProps {
	subject: ConversationSubject
	mode: ChatPermissionMode
	model: string | null
	onModeChange: (next: ChatPermissionMode) => void
	onModelChange: (next: string | null) => void
	/** Called once the new conversation row exists. Parent swaps the empty
	 * state for the conversation view, which then sends the operator's
	 * first message via the standard turn-create mutation — keeping retries
	 * on a single conversation row instead of double-creating on transient
	 * failure. */
	onCreated: (conversationId: string, firstMessage: string) => void
}

// V1 fixes the chat agent identifier — there is no "role" axis to pick
// (planner/coder), only the provider that handles the conversation. Once a
// runtime registry exposes per-agent profiles we can reintroduce the axis.
const DEFAULT_AGENT_ID = 'default'

// Splits conversation creation from first-turn send to isolate transient failures.
export function NewChatLauncher({
	subject,
	mode,
	model,
	onModeChange,
	onModelChange,
	onCreated
}: NewChatLauncherProps) {
	const queryClient = useQueryClient()
	const [provider, setProvider] = useState<AgentProvider>('claude')
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const listKey = queryKeys.conversations.list(subjectKey(subject))

	const create = useCallback(
		async (firstTurnText: string) => {
			if (!provider) return
			setBusy(true)
			setError(null)
			try {
				const convo = await createConversation({
					subject,
					agent_id: DEFAULT_AGENT_ID,
					provider
				})
				queryClient.invalidateQueries({ queryKey: listKey })
				onCreated(convo.id, firstTurnText)
			} catch (err) {
				setError(String(err))
				throw err
			} finally {
				setBusy(false)
			}
		},
		[provider, subject, queryClient, listKey, onCreated]
	)

	return (
		<ChatComposer
			onSubmit={(text) => create(text)}
			onCancelActiveTurn={() => {}}
			disabled={busy}
			streaming={false}
			error={error}
			mode={mode}
			model={model}
			provider={provider}
			onProviderChange={setProvider}
			onModeChange={onModeChange}
			onModelChange={onModelChange}
		/>
	)
}
