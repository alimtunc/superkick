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

/**
 * Per-subject conversation row selection backed by `localStorage`. Keeps
 * `selectedId` aligned with `subjectKey` so a subject switch can never
 * persist the previous subject's selection under the new subject's key.
 *
 * Hydration is two-phase because the conversation list is loaded async:
 *  1. the subject change resets selection synchronously;
 *  2. once `loading === false`, we read `localStorage` and pick either the
 *     persisted id (when still present in the list) or the first row.
 *
 * Persistence happens on every commit where the tracked subject matches
 * the current one — the tracked-key gate prevents the cross-subject leak
 * that motivated this hook (see SUP-110 review).
 */
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

	// `conversations` is a fresh array reference on every TanStack Query
	// revalidation, so depending on it would re-fire the effect even when
	// the row set is identical. The hydration only needs to read the latest
	// list at the moment it runs (transition to `loading: false`, or subject
	// switch), so route the access through a ref and gate the effect on
	// `loading` + `tracked.*` only.
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
