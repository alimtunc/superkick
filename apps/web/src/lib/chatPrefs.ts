import type { ChatPermissionMode } from '@/types'

// Both fields optional: `model: null` means "default provider model" (distinct
// from "no preference yet") so only explicit operator choices get persisted.

interface ChatPrefs {
	mode?: ChatPermissionMode
	model?: string | null
}

export const DEFAULT_CHAT_MODE: ChatPermissionMode = 'edit_automatically'
export const DEFAULT_CHAT_MODEL: string | null = null

const PREFS_PREFIX = 'superkick.chat.prefs.'
const SELECTED_ID_PREFIX = 'superkick.chat.selectedId.'

// Typed as `ReadonlySet<string>` so the `.has` check narrows the raw input
// before we cast to `ChatPermissionMode` — typing it as the enum would let
// the cast bypass the validation entirely.
const VALID_MODES: ReadonlySet<string> = new Set<ChatPermissionMode>([
	'ask_before_edits',
	'edit_automatically',
	'plan_mode',
	'auto_mode'
])

function prefsKey(subjectKey: string): string {
	return PREFS_PREFIX + subjectKey
}

function selectedIdKey(subjectKey: string): string {
	return SELECTED_ID_PREFIX + subjectKey
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitize(raw: unknown): ChatPrefs {
	if (!isRecord(raw)) return {}
	const out: ChatPrefs = {}
	const mode = raw.mode
	if (typeof mode === 'string' && VALID_MODES.has(mode)) {
		out.mode = mode as ChatPermissionMode
	}
	if ('model' in raw) {
		const model = raw.model
		if (model === null || typeof model === 'string') out.model = model
	}
	return out
}

export function readChatPrefs(subjectKey: string): ChatPrefs {
	if (typeof window === 'undefined') return {}
	try {
		const raw = window.localStorage.getItem(prefsKey(subjectKey))
		if (raw === null) return {}
		return sanitize(JSON.parse(raw))
	} catch {
		return {}
	}
}

export function writeChatPrefs(subjectKey: string, partial: ChatPrefs): void {
	if (typeof window === 'undefined') return
	try {
		const current = readChatPrefs(subjectKey)
		const next: ChatPrefs = { ...current }
		if ('mode' in partial) next.mode = partial.mode
		if ('model' in partial) next.model = partial.model
		window.localStorage.setItem(prefsKey(subjectKey), JSON.stringify(next))
	} catch {
		// see file header — degrade silently.
	}
}

export function readSelectedConversationId(subjectKey: string): string | null {
	if (typeof window === 'undefined') return null
	try {
		return window.localStorage.getItem(selectedIdKey(subjectKey))
	} catch {
		return null
	}
}

export function writeSelectedConversationId(subjectKey: string, value: string | null): void {
	if (typeof window === 'undefined') return
	try {
		if (value === null) window.localStorage.removeItem(selectedIdKey(subjectKey))
		else window.localStorage.setItem(selectedIdKey(subjectKey), value)
	} catch {
		// see file header — degrade silently.
	}
}
