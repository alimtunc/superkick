import type { CSSProperties } from 'react'

import { cn } from '@/lib/utils'
import type { AgentProvider } from '@/types'
import type { SKIconName, SKTone } from '@/types/icons'
import type { TaskBadgeKind } from '@/types/lifecycle'

import { Icon } from './Icon'

interface AvatarProps {
	name?: string
	/** Stable key for the fixed palette slot. Falls back to `name`. */
	id?: string
	/** Render as a rounded-square agent mark. Pass the agent identity for a dedicated color. */
	agent?: AgentProvider | boolean
	/** Corner state dot on agent avatars. */
	state?: TaskBadgeKind
	size?: number
	/** Explicit semantic background (overrides the fixed palette). */
	tone?: SKTone
	/** Render an icon glyph instead of initials. */
	icon?: SKIconName
	className?: string
}

const TONE_BG: Record<SKTone, string> = {
	neutral: 'bg-raised',
	accent: 'bg-accent',
	success: 'bg-success',
	warn: 'bg-warn',
	danger: 'bg-danger',
	info: 'bg-info'
}

const PALETTE_COUNT = 8

const STATE_DOT: Record<TaskBadgeKind, string> = {
	needs: 'var(--agent-needs)',
	running: 'var(--agent-running)',
	review: 'var(--agent-review)',
	shipped: 'var(--agent-shipped)'
}

function initialsOf(name?: string): string {
	if (!name) return ''
	return name
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => word[0])
		.slice(0, 2)
		.join('')
		.toUpperCase()
}

/** Stable, well-spread slot 1..8 for an entity — fixed per entity, never look-alike. */
function paletteSlot(key: string): number {
	let h = 0
	for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
	return (h % PALETTE_COUNT) + 1
}

function paletteClass(key: string): string {
	return `av-${paletteSlot(key)}`
}

export function Avatar({ name, id, agent, state, size = 20, tone, icon, className }: AvatarProps) {
	const style: CSSProperties & Record<`--${string}`, string> = {
		width: size,
		height: size,
		fontSize: Math.max(9, Math.round(size * 0.48))
	}
	if (agent && state) style['--avatar-dot'] = STATE_DOT[state]

	const isAgent = Boolean(agent)
	const paletteKey = id ?? name ?? ''
	const colorClass = (() => {
		if (tone) return TONE_BG[tone]
		if (agent === 'claude') return 'av-claude'
		if (agent === 'codex') return 'av-codex'
		if (paletteKey) return paletteClass(paletteKey)
		return null
	})()

	const empty = !icon && !paletteKey && !isAgent

	return (
		<span
			className={cn(
				'avatar',
				isAgent && 'avatar--agent',
				isAgent && !state && 'avatar--no-dot',
				empty && 'avatar--empty',
				colorClass,
				className
			)}
			style={style}
			title={name}
		>
			{icon ? <Icon name={icon} size={Math.round(size * 0.55)} /> : empty ? '?' : initialsOf(name)}
		</span>
	)
}
