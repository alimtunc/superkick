import type { ReactNode } from 'react'

import { Icon } from '@/components/primitives'
import { isAvatarSKIcon } from '@/lib/agentAvatar'
import type { AgentAvatar } from '@/types'

interface AgentAvatarBadgeProps {
	avatar: AgentAvatar | null
	name: string
	size?: number
}

const FALLBACK_COLOR = '#6366f1'

function avatarGlyph(icon: string | undefined, name: string, size: number): ReactNode {
	if (icon && isAvatarSKIcon(icon)) return <Icon name={icon} size={Math.round(size * 0.52)} />
	if (icon) return <span>{icon}</span>
	const initial = name.trim().slice(0, 1).toUpperCase()
	return <span>{initial || '?'}</span>
}

/** Rounded-square identity badge: emoji or SK icon on the agent's accent color. */
export function AgentAvatarBadge({ avatar, name, size = 28 }: AgentAvatarBadgeProps) {
	return (
		<span
			className="inline-flex shrink-0 items-center justify-center rounded-[8px] font-medium text-white"
			style={{
				width: size,
				height: size,
				background: avatar?.color ?? FALLBACK_COLOR,
				fontSize: Math.round(size * 0.46)
			}}
			aria-hidden="true"
		>
			{avatarGlyph(avatar?.icon, name, size)}
		</span>
	)
}
