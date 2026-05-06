import { useCallback, useEffect, useRef, useState } from 'react'

import { ChatConversationView } from '@/components/chat/ChatConversationView'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { EmptyChat } from '@/components/chat/EmptyChat'
import { NewChatLauncher } from '@/components/chat/NewChatLauncher'
import { useConversationsList } from '@/hooks/useConversationsList'
import { subjectKey } from '@/lib/conversations'
import type { ChatPermissionMode, ConversationSubject } from '@/types'

interface ChatPanelProps {
	subject: ConversationSubject
}

const STORAGE_PREFIX = 'superkick.chat.selectedId.'

function readPersistedSelection(key: string): string | null {
	if (typeof window === 'undefined') return null
	try {
		return window.localStorage.getItem(STORAGE_PREFIX + key)
	} catch {
		return null
	}
}

function writePersistedSelection(key: string, value: string | null): void {
	if (typeof window === 'undefined') return
	try {
		if (value === null) window.localStorage.removeItem(STORAGE_PREFIX + key)
		else window.localStorage.setItem(STORAGE_PREFIX + key, value)
	} catch {
		// localStorage unavailable (private mode, quota) — selection just
		// won't persist this session, which is acceptable.
	}
}

export function ChatPanel({ subject }: ChatPanelProps) {
	const key = subjectKey(subject)
	const list = useConversationsList(subject)

	// Mode + model live at the panel level so they stay sticky as the
	// operator switches between conversations within the same mount, which
	// preserves SUP-100 picker behavior (AC 10).
	const [mode, setMode] = useState<ChatPermissionMode>('edit_automatically')
	const [model, setModel] = useState<string | null>(null)

	const [selectedId, setSelectedId] = useState<string | null>(null)
	const [hydrated, setHydrated] = useState(false)
	const [pendingFirstMessage, setPendingFirstMessage] = useState<string | null>(null)

	// Tracks the subject key that the current `selectedId` / `hydrated` pair
	// belongs to. Without this, switching subjects schedules state resets
	// that have not applied yet by the time the persist effect runs in the
	// same commit — so the persist effect would write the *old* selectedId
	// against the *new* localStorage key. The ref is read live in both
	// effects so the cross-effect synchronisation is unambiguous.
	const hydratedKeyRef = useRef<string | null>(null)

	useEffect(() => {
		if (hydrated || list.loading) return
		const persisted = readPersistedSelection(key)
		const present = persisted && list.conversations.some((c) => c.id === persisted)
		if (present) {
			setSelectedId(persisted)
		} else if (list.conversations.length > 0) {
			setSelectedId(list.conversations[0]?.id ?? null)
		} else {
			setSelectedId(null)
		}
		setHydrated(true)
		hydratedKeyRef.current = key
	}, [hydrated, list.loading, list.conversations, key])

	useEffect(() => {
		if (hydratedKeyRef.current === key) return
		setHydrated(false)
		setSelectedId(null)
		setPendingFirstMessage(null)
		hydratedKeyRef.current = null
	}, [key])

	useEffect(() => {
		if (!hydrated || hydratedKeyRef.current !== key) return
		writePersistedSelection(key, selectedId)
	}, [hydrated, key, selectedId])

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
