import { useCallback, useState } from 'react'

import { createConversation } from '@/api'
import { ChatComposer } from '@/domains/chat/components/ChatComposer'
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
	onCreated: (conversationId: string, firstMessage: string) => void
}

const DEFAULT_AGENT_ID = 'default'

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
