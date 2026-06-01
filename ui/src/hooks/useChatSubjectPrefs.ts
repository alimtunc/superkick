import { useCallback, useState } from 'react'

import { DEFAULT_CHAT_MODE, DEFAULT_CHAT_MODEL, readChatPrefs, writeChatPrefs } from '@/lib/chatPrefs'
import type { ChatPermissionMode } from '@/types'

interface UseChatSubjectPrefsResult {
	mode: ChatPermissionMode
	setMode: (next: ChatPermissionMode) => void
	model: string | null
	setModel: (next: string | null) => void
}

interface TrackedPrefs {
	key: string
	mode: ChatPermissionMode
	model: string | null
}

function hydrate(subjectKey: string): TrackedPrefs {
	const prefs = readChatPrefs(subjectKey)
	return {
		key: subjectKey,
		mode: prefs.mode ?? DEFAULT_CHAT_MODE,
		model: prefs.model !== undefined ? prefs.model : DEFAULT_CHAT_MODEL
	}
}

export function useChatSubjectPrefs(subjectKey: string): UseChatSubjectPrefsResult {
	const [tracked, setTracked] = useState<TrackedPrefs>(() => hydrate(subjectKey))

	if (tracked.key !== subjectKey) setTracked(hydrate(subjectKey))

	// Writes stay outside the setState updater: StrictMode invokes updaters twice, double-writing localStorage.
	const setMode = useCallback(
		(next: ChatPermissionMode) => {
			writeChatPrefs(subjectKey, { mode: next })
			setTracked((prev) => ({ ...prev, mode: next }))
		},
		[subjectKey]
	)

	const setModel = useCallback(
		(next: string | null) => {
			writeChatPrefs(subjectKey, { model: next })
			setTracked((prev) => ({ ...prev, model: next }))
		},
		[subjectKey]
	)

	return { mode: tracked.mode, setMode, model: tracked.model, setModel }
}
