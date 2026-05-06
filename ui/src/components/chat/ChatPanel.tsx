import { useCallback, useState } from 'react'

import { ChatConversationView } from '@/components/chat/ChatConversationView'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { EmptyChat } from '@/components/chat/EmptyChat'
import { NewChatLauncher } from '@/components/chat/NewChatLauncher'
import { useChatSubjectPrefs } from '@/hooks/useChatSubjectPrefs'
import { useChatSubjectSelection } from '@/hooks/useChatSubjectSelection'
import { useChatSubjectStates } from '@/hooks/useChatSubjectStates'
import { useConversationsList } from '@/hooks/useConversationsList'
import { subjectKey } from '@/lib/conversations'
import type { ConversationSubject } from '@/types'

interface ChatPanelProps {
	subject: ConversationSubject
}

export function ChatPanel({ subject }: ChatPanelProps) {
	const key = subjectKey(subject)
	const list = useConversationsList(subject)

	const { selectedId, setSelectedId } = useChatSubjectSelection({
		subjectKey: key,
		conversations: list.conversations,
		loading: list.loading
	})
	const { mode, setMode, model, setModel } = useChatSubjectPrefs(key)
	const subjectStates = useChatSubjectStates(subject, list.conversations, selectedId)

	const [pendingFirstMessage, setPendingFirstMessage] = useState<string | null>(null)

	const handleSelect = (id: string) => setSelectedId(id)
	const handleNewChat = () => setSelectedId(null)
	const handleCreated = (id: string, firstMessage: string) => {
		setPendingFirstMessage(firstMessage)
		setSelectedId(id)
		list.refetch()
	}
	const consumePendingFirstMessage = useCallback(() => setPendingFirstMessage(null), [])

	return (
		<section className="bg-carbon-dim/40 flex h-[60vh] min-h-105 overflow-hidden rounded-md border border-edge">
			<ChatSidebar
				conversations={list.conversations}
				selectedId={selectedId}
				loading={list.loading}
				onSelect={handleSelect}
				onNewChat={handleNewChat}
				statesById={subjectStates}
			/>
			<main className="flex-1 overflow-hidden">
				{selectedId ? (
					<ChatConversationView
						conversationId={selectedId}
						subject={subject}
						mode={mode}
						model={model}
						onModeChange={setMode}
						onModelChange={setModel}
						pendingFirstMessage={pendingFirstMessage}
						onPendingFirstMessageConsumed={consumePendingFirstMessage}
					/>
				) : (
					<EmptyChat
						launcher={
							<NewChatLauncher
								subject={subject}
								mode={mode}
								model={model}
								onModeChange={setMode}
								onModelChange={setModel}
								onCreated={handleCreated}
							/>
						}
					/>
				)}
			</main>
		</section>
	)
}
