import { useCallback, useEffect, useRef, useState } from 'react'

import { readSelectedConversationId, writeSelectedConversationId } from '@/lib/chatPrefs'
import type { ConversationSummary } from '@/types'

interface UseChatSubjectSelectionArgs {
	subjectKey: string
	conversations: readonly ConversationSummary[]
	loading: boolean
}

interface UseChatSubjectSelectionResult {
	selectedId: string | null
	setSelectedId: (id: string | null) => void
	hydrated: boolean
}

interface TrackedSelection {
	key: string
	selectedId: string | null
	hydrated: boolean
}

export function useChatSubjectSelection(args: UseChatSubjectSelectionArgs): UseChatSubjectSelectionResult {
	const { subjectKey, conversations, loading } = args

	const [tracked, setTracked] = useState<TrackedSelection>(() => ({
		key: subjectKey,
		selectedId: null,
		hydrated: false
	}))

	if (tracked.key !== subjectKey) {
		setTracked({ key: subjectKey, selectedId: null, hydrated: false })
	}

	// Via ref so the effect isn't re-fired by `conversations` getting a fresh array reference on every revalidation.
	const conversationsRef = useRef(conversations)
	conversationsRef.current = conversations

	useEffect(() => {
		if (tracked.key !== subjectKey || tracked.hydrated || loading) return
		const list = conversationsRef.current
		const persisted = readSelectedConversationId(subjectKey)
		const present = persisted !== null && list.some((conversation) => conversation.id === persisted)
		const next = present ? persisted : (list[0]?.id ?? null)
		setTracked({ key: subjectKey, selectedId: next, hydrated: true })
	}, [tracked.key, tracked.hydrated, subjectKey, loading])

	useEffect(() => {
		if (!tracked.hydrated || tracked.key !== subjectKey) return
		writeSelectedConversationId(subjectKey, tracked.selectedId)
	}, [tracked.hydrated, tracked.key, tracked.selectedId, subjectKey])

	const setSelectedId = useCallback((id: string | null) => {
		setTracked((prev) => ({ ...prev, selectedId: id }))
	}, [])

	return { selectedId: tracked.selectedId, setSelectedId, hydrated: tracked.hydrated }
}
