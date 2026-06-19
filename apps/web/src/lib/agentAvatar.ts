// Avatar picker presets + glyph detection for app-managed agents.
// Local-first: an avatar is an emoji OR an SK icon name, plus an accent color.
import type { AgentAvatar } from '@/types'
import type { SKIconName } from '@/types/icons'

/** SK icons offered in the avatar picker (a curated subset of the icon bank). */
export const AGENT_AVATAR_ICONS: SKIconName[] = [
	'doc',
	'terminal',
	'search',
	'spark',
	'bot',
	'zap',
	'star',
	'flag',
	'layers',
	'agent',
	'pin',
	'folder'
]

/** Emoji offered in the avatar picker. */
export const AGENT_AVATAR_EMOJIS = ['🤖', '📋', '🛠️', '🔍', '🚀', '⚡', '🧠', '🧪', '🎯', '🦊', '🐙', '✨']

/** Accent colors offered in the avatar picker. */
export const AGENT_AVATAR_COLORS = [
	'#6366f1',
	'#10b981',
	'#f59e0b',
	'#ef4444',
	'#06b6d4',
	'#a855f7',
	'#ec4899',
	'#84cc16'
]

export const DEFAULT_AGENT_AVATAR: AgentAvatar = { icon: 'spark', color: AGENT_AVATAR_COLORS[0] }

const ICON_SET = new Set<string>(AGENT_AVATAR_ICONS)

/** Whether an avatar `icon` is one of our SK icons (else it renders as an emoji). */
export function isAvatarSKIcon(icon: string): icon is SKIconName {
	return ICON_SET.has(icon)
}
