import type { CSSProperties } from 'react'

import { cn } from '@/lib/utils'
import type { SKIconName, SKTone } from '@/types/icons'

import { Icon } from './Icon'

interface AvatarProps {
	name?: string
	tone?: SKTone
	size?: number
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

export function Avatar({ name, tone = 'neutral', size = 22, icon, className }: AvatarProps) {
	const style: CSSProperties = {
		width: size,
		height: size,
		fontSize: Math.round(size * 0.42)
	}
	return (
		<span
			className={cn(
				'inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-[0.2px] text-white',
				TONE_BG[tone],
				className
			)}
			style={style}
		>
			{icon ? <Icon name={icon} size={Math.round(size * 0.55)} /> : initialsOf(name)}
		</span>
	)
}
