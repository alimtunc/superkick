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

	// Side effects must live outside the setState updater — StrictMode
	// invokes updaters twice in development, which would double-write to
	// localStorage on every click.
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
