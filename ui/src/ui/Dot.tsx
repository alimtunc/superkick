import type { CSSProperties } from 'react'

import { cn } from '@/lib/utils'
import type { SKTone } from '@/types/icons'

type DotSize = 4 | 6 | 8

interface DotProps {
	tone?: SKTone
	size?: DotSize
	pulse?: boolean
	className?: string
}

const TONE_BG: Record<SKTone, string> = {
	neutral: 'bg-fg-dim',
	accent: 'bg-accent',
	success: 'bg-success',
	warn: 'bg-warn',
	danger: 'bg-danger',
	info: 'bg-info'
}

const TONE_RING: Record<SKTone, string> = {
	neutral: 'ring-fg-dim/25',
	accent: 'ring-accent/25',
	success: 'ring-success/25',
	warn: 'ring-warn/25',
	danger: 'ring-danger/25',
	info: 'ring-info/25'
}

export function Dot({ tone = 'neutral', size = 8, pulse = false, className }: DotProps) {
	const style: CSSProperties = { width: size, height: size }
	return (
		<span
			className={cn(
				'inline-block shrink-0 rounded-full',
				TONE_BG[tone],
				pulse ? `ring-4 ${TONE_RING[tone]}` : null,
				className
			)}
			style={style}
		/>
	)
}
