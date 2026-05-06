import { useCallback, useState } from 'react'

import { readChatPrefs, writeChatPrefs } from '@/lib/chatPrefs'
import type { ChatPermissionMode } from '@/types'

export const DEFAULT_CHAT_MODE: ChatPermissionMode = 'edit_automatically'
export const DEFAULT_CHAT_MODEL: string | null = null

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

/**
 * SUP-113 — read/write the chat panel's `mode` + `model` selection for a
 * given subject. Persists only on operator-initiated `setMode` / `setModel`
 * calls so merely opening a fresh subject does not write the global default
 * back to `localStorage` (the "no preference yet" state must stay distinct
 * from "operator chose the default").
 *
 * Re-hydrates synchronously when `subjectKey` changes via the React
 * "storing information from previous renders" pattern, which keeps the
 * post-switch render observing the new subject's values directly — no
 * effect roundtrip means no opportunity to leak the previous subject's
 * values across the gap.
 */
export function useChatSubjectPrefs(subjectKey: string): UseChatSubjectPrefsResult {
	const [tracked, setTracked] = useState<TrackedPrefs>(() => hydrate(subjectKey))

	if (tracked.key !== subjectKey) setTracked(hydrate(subjectKey))

	const setMode = useCallback((next: ChatPermissionMode) => {
		setTracked((prev) => {
			writeChatPrefs(prev.key, { mode: next })
			return { ...prev, mode: next }
		})
	}, [])

	const setModel = useCallback((next: string | null) => {
		setTracked((prev) => {
			writeChatPrefs(prev.key, { model: next })
			return { ...prev, model: next }
		})
	}, [])

	return { mode: tracked.mode, setMode, model: tracked.model, setModel }
}
